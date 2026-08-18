import { NextResponse } from 'next/server';
import {
  canAccessCommerceBranch,
  getCommerceRequestContext,
  hasCommercePermission,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';
import { COMMERCE_PAYMENT_METHODS } from '@/lib/commerce';
import { verifyManagerPin } from '@/lib/managerPin';

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);

    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const branchId = typeof body.branch_id === 'string' ? body.branch_id : '';

    if (!branchId || !canAccessCommerceBranch(context.profile, branchId) || !hasCommercePermission(context.profile, 'pos.sell', branchId) || !Array.isArray(body.items) || !Array.isArray(body.payments) || typeof body.idempotency_key !== 'string' || (body.register_session_id != null && typeof body.register_session_id !== 'string')) {
      return NextResponse.json({ error: 'ข้อมูลรายการขายไม่ถูกต้อง' }, { status: 400 });
    }

    const admin = requireSupabaseAdmin();
    const { data: posSettings, error: settingsError } = await admin
      .from('pos_branch_settings')
      .select('require_open_register, enabled_payment_methods')
      .eq('branch_id', branchId)
      .maybeSingle();
    if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 });
    if ((posSettings?.require_open_register !== false) && !body.register_session_id) {
      return NextResponse.json({ error: 'ต้องเปิดกะ POS ก่อนรับชำระเงิน' }, { status: 400 });
    }
    const allowedMethods = Array.isArray(posSettings?.enabled_payment_methods)
      ? posSettings.enabled_payment_methods.filter((method): method is typeof COMMERCE_PAYMENT_METHODS[number] => COMMERCE_PAYMENT_METHODS.includes(method as typeof COMMERCE_PAYMENT_METHODS[number]))
      : COMMERCE_PAYMENT_METHODS;
    if (body.payments.some((payment: unknown) => !payment || typeof payment !== 'object' || !allowedMethods.includes((payment as { method?: typeof COMMERCE_PAYMENT_METHODS[number] }).method || 'cash'))) {
      return NextResponse.json({ error: 'มีวิธีรับชำระที่สาขานี้ไม่ได้เปิดใช้งาน' }, { status: 400 });
    }
    const { data, error } = await admin.rpc('commerce_finalize_pos_sale', {
      p_user_id: context.profile.id,
      p_branch_id: branchId,
      p_register_session_id: typeof body.register_session_id === 'string' ? body.register_session_id : null,
      p_customer_id: typeof body.customer_id === 'string' ? body.customer_id : null,
      p_items: body.items,
      p_payments: body.payments,
      p_idempotency_key: body.idempotency_key,
      p_note: typeof body.note === 'string' ? body.note : null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ result: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to complete sale';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const params = new URL(request.url).searchParams;
    const branchId = params.get('branch_id') || context.profile.branch_id;
    if (!branchId || !canAccessCommerceBranch(context.profile, branchId) || !hasCommercePermission(context.profile, 'pos.sell', branchId)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูรายการขายของสาขานี้' }, { status: 403 });
    }

    const admin = requireSupabaseAdmin();
    let query = admin
      .from('sales')
      .select('id, receipt_number, grand_total, status, completed_at, performed_by_user_id')
      .eq('branch_id', branchId)
      .order('completed_at', { ascending: false })
      .limit(40);

    if (context.profile.role === 'employee') query = query.eq('performed_by_user_id', context.profile.id);
    const { data: sales, error: salesError } = await query;
    if (salesError) return NextResponse.json({ error: salesError.message }, { status: 500 });

    const saleIds = (sales || []).map((sale) => sale.id);
    const { data: items, error: itemsError } = saleIds.length
      ? await admin.from('sale_items').select('id, sale_id, product_name_snapshot, unit_name_snapshot, quantity, line_total').in('sale_id', saleIds)
      : { data: [], error: null };
    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

    const itemsBySale = new Map<string, typeof items>();
    (items || []).forEach((item) => itemsBySale.set(item.sale_id, [...(itemsBySale.get(item.sale_id) || []), item]));

    return NextResponse.json({
      sales: (sales || []).map((sale) => ({ ...sale, items: itemsBySale.get(sale.id) || [] })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load sales history';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    if (body.action !== 'void' || typeof body.sale_id !== 'string' || typeof body.reason !== 'string') {
      return NextResponse.json({ error: 'ข้อมูลยกเลิกบิลไม่ถูกต้อง' }, { status: 400 });
    }
    const admin = requireSupabaseAdmin();
    const { data: sale } = await admin.from('sales').select('branch_id').eq('id', body.sale_id).maybeSingle();
    if (!sale || !canAccessCommerceBranch(context.profile, sale.branch_id)) {
      return NextResponse.json({ error: 'ต้องใช้สิทธิ์ผู้จัดการเพื่อยกเลิกบิล' }, { status: 403 });
    }
    let approverId = context.profile.id;
    if (!hasCommercePermission(context.profile, 'pos.void', sale.branch_id)) {
      approverId = await verifyManagerPin(sale.branch_id, String(body.manager_pin || ''), 'pos.void') || '';
      if (!approverId) return NextResponse.json({ error: 'Manager PIN ไม่ถูกต้องหรือไม่มีสิทธิ์ยกเลิกบิล' }, { status: 403 });
      await admin.from('manager_approvals').insert({ branch_id: sale.branch_id, requested_by_user_id: context.profile.id, approved_by_user_id: approverId, action_code: 'pos.void', entity_type: 'sale', entity_id: body.sale_id, reason: body.reason, status: 'approved', approved_at: new Date().toISOString() });
    }
    const { data, error } = await admin.rpc('commerce_void_sale', { p_user_id: approverId, p_sale_id: body.sale_id, p_reason: body.reason });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ result: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'ยกเลิกบิลไม่สำเร็จ' }, { status: 500 });
  }
}
