import { NextResponse } from 'next/server';
import generatePayload from 'promptpay-qr';
import { canAccessCommerceBranch, getCommerceRequestContext, hasCommercePermission, requireSupabaseAdmin } from '@/lib/commerceServer';

export async function GET(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const params = new URL(request.url).searchParams;
    const branchId = params.get('branch_id') || '';
    const amount = Number(params.get('amount'));
    if (!branchId || !canAccessCommerceBranch(context.profile, branchId) || !hasCommercePermission(context.profile, 'pos.sell', branchId) || !Number.isFinite(amount) || amount <= 0 || amount > 9_999_999.99) {
      return NextResponse.json({ error: 'ข้อมูล QR รับชำระไม่ถูกต้อง' }, { status: 400 });
    }
    const { data: settings, error } = await requireSupabaseAdmin()
      .from('pos_branch_settings')
      .select('promptpay_enabled, promptpay_id, promptpay_display_name')
      .eq('branch_id', branchId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!settings?.promptpay_enabled || !settings.promptpay_id) {
      return NextResponse.json({ error: 'สาขานี้ยังไม่ได้ตั้งค่า PromptPay QR' }, { status: 409 });
    }
    return NextResponse.json({
      payload: generatePayload(settings.promptpay_id, { amount: Math.round(amount * 100) / 100 }),
      amount: Math.round(amount * 100) / 100,
      receiverLabel: settings.promptpay_display_name || 'บัญชี PromptPay ของสาขา',
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'สร้าง PromptPay QR ไม่สำเร็จ' }, { status: 500 });
  }
}
