import { NextResponse } from 'next/server';
import {
  canManageCommerce,
  getCommerceRequestContext,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';
import { toNumber } from '@/lib/commerce';

type RouteContext = { params: Promise<{ customerId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const context = await getCommerceRequestContext(request);
  if (!context || !canManageCommerce(context.profile)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูประวัติลูกค้า' }, { status: 403 });
  }

  const { customerId } = await params;
  if (!customerId) return NextResponse.json({ error: 'ไม่พบลูกค้า' }, { status: 400 });

  const admin = requireSupabaseAdmin();
  const [customerResult, salesResult, onlineOrdersResult, pointsResult] = await Promise.all([
    admin.from('customers').select('id, full_name, phone, email, member_code, referral_code, customer_type, points_balance, credit_limit, created_at').eq('id', customerId).eq('is_active', true).maybeSingle(),
    admin.from('sales').select('id, receipt_number, branch_id, status, grand_total, completed_at, source_channel').eq('customer_id', customerId).order('completed_at', { ascending: false }).limit(50),
    admin.from('online_orders').select('id, order_number, branch_id, status, grand_total, placed_at, fulfillment_method').eq('customer_id', customerId).order('placed_at', { ascending: false }).limit(50),
    admin.from('customer_point_transactions').select('id, points_delta, transaction_type, note, created_at, sale_id').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(100),
  ]);

  const error = [customerResult.error, salesResult.error, onlineOrdersResult.error, pointsResult.error].find(Boolean);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!customerResult.data) return NextResponse.json({ error: 'ไม่พบลูกค้า' }, { status: 404 });

  const branchIds = [...new Set([
    ...(salesResult.data || []).map((sale) => sale.branch_id),
    ...(onlineOrdersResult.data || []).map((order) => order.branch_id),
  ])];
  const { data: branches } = branchIds.length
    ? await admin.from('branches').select('id, name').in('id', branchIds)
    : { data: [] };
  const branchNameById = new Map((branches || []).map((branch) => [branch.id, branch.name]));
  const sales = salesResult.data || [];
  const onlineOrders = onlineOrdersResult.data || [];

  return NextResponse.json({
    customer: customerResult.data,
    summary: {
      completedSales: sales.filter((sale) => sale.status !== 'voided').reduce((total, sale) => total + toNumber(sale.grand_total), 0),
      completedOnlineOrders: onlineOrders.filter((order) => order.status === 'completed').reduce((total, order) => total + toNumber(order.grand_total), 0),
      saleCount: sales.length,
      onlineOrderCount: onlineOrders.length,
    },
    sales: sales.map((sale) => ({ ...sale, branch_name: branchNameById.get(sale.branch_id) || 'ไม่ระบุสาขา' })),
    online_orders: onlineOrders.map((order) => ({ ...order, branch_name: branchNameById.get(order.branch_id) || 'ไม่ระบุสาขา' })),
    point_transactions: pointsResult.data || [],
  });
}
