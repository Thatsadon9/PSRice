import { NextResponse } from 'next/server';
import { canAccessCommerceBranch, canManageCommerce, getCommerceRequestContext, requireSupabaseAdmin } from '@/lib/commerceServer';

export async function GET(request: Request) {
  const context = await getCommerceRequestContext(request);
  if (!context || !canManageCommerce(context.profile)) return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึงคำสั่งซื้อออนไลน์' }, { status: 403 });
  const branchId = new URL(request.url).searchParams.get('branch_id') || context.profile.branch_id;
  if (!branchId || !canAccessCommerceBranch(context.profile, branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึงสาขานี้' }, { status: 403 });
  const { data, error } = await requireSupabaseAdmin().from('online_orders').select('id, order_number, customer_name, customer_phone, fulfillment_method, delivery_address, status, subtotal, grand_total, payment_method, note, placed_at, online_order_items(id, product_name_snapshot, unit_name_snapshot, quantity, unit_price, line_total)').eq('branch_id', branchId).order('placed_at', { ascending: false }).limit(80);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data || [] });
}

export async function PATCH(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context || !canManageCommerce(context.profile)) return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการคำสั่งซื้อออนไลน์' }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const branchId = typeof body.branch_id === 'string' ? body.branch_id : '';
    const orderId = typeof body.order_id === 'string' ? body.order_id : '';
    const nextStatus = typeof body.status === 'string' ? body.status : '';
    if (!branchId || !orderId || !canAccessCommerceBranch(context.profile, branchId)) return NextResponse.json({ error: 'ข้อมูลคำสั่งซื้อไม่ถูกต้อง' }, { status: 400 });
    const { data, error } = await requireSupabaseAdmin().rpc('commerce_update_online_order_status', { p_user_id: context.profile.id, p_branch_id: branchId, p_order_id: orderId, p_next_status: nextStatus });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ result: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'ไม่สามารถเปลี่ยนสถานะได้' }, { status: 500 });
  }
}
