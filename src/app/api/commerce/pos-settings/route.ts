import { NextResponse } from 'next/server';
import {
  canAccessCommerceBranch,
  getCommerceRequestContext,
  hasCommercePermission,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';
import { COMMERCE_PAYMENT_METHODS } from '@/lib/commerce';
import { getPromptPayIdentifierType, normalizePromptPayId } from '@/lib/promptpay';

function toSettings(row: Record<string, unknown> | null) {
  return {
    promptpay_enabled: Boolean(row?.promptpay_enabled),
    promptpay_id: typeof row?.promptpay_id === 'string' ? row.promptpay_id : '',
    promptpay_display_name: typeof row?.promptpay_display_name === 'string' ? row.promptpay_display_name : '',
    default_register_name: typeof row?.default_register_name === 'string' ? row.default_register_name : 'Counter 1',
    require_open_register: row?.require_open_register !== false,
    show_out_of_stock: Boolean(row?.show_out_of_stock),
    enabled_payment_methods: Array.isArray(row?.enabled_payment_methods)
      ? row.enabled_payment_methods.filter((method): method is string => typeof method === 'string' && COMMERCE_PAYMENT_METHODS.includes(method as typeof COMMERCE_PAYMENT_METHODS[number]))
      : COMMERCE_PAYMENT_METHODS,
    receipt_footer: typeof row?.receipt_footer === 'string' ? row.receipt_footer : '',
  };
}

export async function GET(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = requireSupabaseAdmin();
    const { data: allBranches, error: branchError } = await admin.from('branches').select('id, name').order('name');
    if (branchError) return NextResponse.json({ error: branchError.message }, { status: 500 });
    const branches = (allBranches || []).filter((branch) => hasCommercePermission(context.profile, 'pos.manage_settings', branch.id));
    if (!branches.length) return NextResponse.json({ error: 'ไม่มีสิทธิ์ตั้งค่า POS' }, { status: 403 });
    const requestedBranchId = new URL(request.url).searchParams.get('branch_id');
    const branchId = requestedBranchId || branches[0].id;
    if (!branches.some((branch) => branch.id === branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์ตั้งค่าสาขานี้' }, { status: 403 });
    const { data, error } = await admin.from('pos_branch_settings').select('*').eq('branch_id', branchId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ branch_id: branchId, branches, settings: toSettings(data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'ไม่สามารถโหลดการตั้งค่า POS ได้' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const branchId = typeof body.branch_id === 'string' ? body.branch_id : '';
    if (!branchId || !canAccessCommerceBranch(context.profile, branchId) || !hasCommercePermission(context.profile, 'pos.manage_settings', branchId)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ตั้งค่า POS ของสาขานี้' }, { status: 403 });
    }

    const promptpayEnabled = body.promptpay_enabled === true;
    const promptpayId = typeof body.promptpay_id === 'string' ? normalizePromptPayId(body.promptpay_id) : '';
    const promptpayDisplayName = typeof body.promptpay_display_name === 'string' ? body.promptpay_display_name.trim() : '';
    const defaultRegisterName = typeof body.default_register_name === 'string' ? body.default_register_name.trim() : '';
    const receiptFooter = typeof body.receipt_footer === 'string' ? body.receipt_footer.trim() : '';
    const enabledPaymentMethods = Array.isArray(body.enabled_payment_methods)
      ? [...new Set(body.enabled_payment_methods.filter((method): method is typeof COMMERCE_PAYMENT_METHODS[number] => typeof method === 'string' && COMMERCE_PAYMENT_METHODS.includes(method as typeof COMMERCE_PAYMENT_METHODS[number])))]
      : [];

    if (!defaultRegisterName || defaultRegisterName.length > 80 || promptpayDisplayName.length > 80 || receiptFooter.length > 240 || !enabledPaymentMethods.length) {
      return NextResponse.json({ error: 'ข้อมูลตั้งค่า POS ไม่ถูกต้อง' }, { status: 400 });
    }
    if (promptpayEnabled && !getPromptPayIdentifierType(promptpayId)) {
      return NextResponse.json({ error: 'PromptPay ต้องเป็นเบอร์มือถือ 10 หลัก, เลขประจำตัว/เลขผู้เสียภาษี 13 หลักที่ถูกต้อง หรือ e-Wallet 15 หลัก' }, { status: 400 });
    }
    if (promptpayEnabled && !enabledPaymentMethods.includes('qr')) {
      return NextResponse.json({ error: 'เปิด PromptPay QR แล้วต้องเปิดวิธีรับชำระ QR ด้วย' }, { status: 400 });
    }

    const admin = requireSupabaseAdmin();
    const { data, error } = await admin
      .from('pos_branch_settings')
      .upsert({
        branch_id: branchId,
        promptpay_enabled: promptpayEnabled,
        promptpay_id: promptpayEnabled ? promptpayId : null,
        promptpay_display_name: promptpayDisplayName || null,
        default_register_name: defaultRegisterName,
        require_open_register: body.require_open_register !== false,
        show_out_of_stock: body.show_out_of_stock === true,
        enabled_payment_methods: enabledPaymentMethods,
        receipt_footer: receiptFooter || null,
        updated_by_user_id: context.profile.id,
      }, { onConflict: 'branch_id' })
      .select('*')
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message || 'บันทึกการตั้งค่าไม่สำเร็จ' }, { status: 500 });

    await admin.from('commerce_audit_logs').insert({
      actor_user_id: context.profile.id,
      branch_id: branchId,
      action: 'pos.settings.updated',
      entity_type: 'pos_branch_settings',
      payload: { promptpay_enabled: promptpayEnabled, enabled_payment_methods: enabledPaymentMethods, require_open_register: body.require_open_register !== false },
    });
    return NextResponse.json({ branch_id: branchId, settings: toSettings(data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'บันทึกการตั้งค่า POS ไม่สำเร็จ' }, { status: 500 });
  }
}
