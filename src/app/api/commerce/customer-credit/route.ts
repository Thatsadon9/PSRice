import { NextResponse } from 'next/server';
import { canAccessCommerceBranch, getCommerceRequestContext, hasCommercePermission, requireSupabaseAdmin } from '@/lib/commerceServer';

export async function GET(request: Request) {
  try {
    const context = await getCommerceRequestContext(request); if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const params = new URL(request.url).searchParams; const customerId = params.get('customer_id'); const branchId = params.get('branch_id');
    if (!customerId || !branchId || !canAccessCommerceBranch(context.profile, branchId) || !hasCommercePermission(context.profile, 'crm.credit', branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูเครดิตลูกค้า' }, { status: 403 });
    const admin = requireSupabaseAdmin(); const [{ data: customer, error }, { data: transactions, error: transactionError }] = await Promise.all([admin.from('customers').select('id, full_name, member_code, credit_limit, credit_balance').eq('id', customerId).maybeSingle(), admin.from('customer_credit_transactions').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(100)]);
    if (error || transactionError) throw error || transactionError; if (!customer) return NextResponse.json({ error: 'ไม่พบลูกค้า' }, { status: 404 });
    return NextResponse.json({ customer, transactions: transactions || [] });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load customer credit' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request); if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json(); const branchId = String(body.branch_id || ''); const customerId = String(body.customer_id || ''); const amount = Number(body.amount);
    if (!branchId || !customerId || !Number.isFinite(amount) || amount <= 0 || !hasCommercePermission(context.profile, 'crm.credit', branchId)) return NextResponse.json({ error: 'ข้อมูลรับชำระเครดิตไม่ถูกต้อง' }, { status: 400 });
    const { data, error } = await requireSupabaseAdmin().rpc('commerce_record_customer_credit_payment', { p_user_id: context.profile.id, p_customer_id: customerId, p_branch_id: branchId, p_amount: amount, p_note: typeof body.note === 'string' ? body.note : null });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 }); return NextResponse.json({ result: data }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to record credit payment' }, { status: 500 }); }
}
