import { NextResponse } from 'next/server';
import { canAccessCommerceBranch, getCommerceRequestContext, hasCommercePermission, requireSupabaseAdmin } from '@/lib/commerceServer';

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const branchId = typeof body.branch_id === 'string' ? body.branch_id : '';
    if (!branchId || !canAccessCommerceBranch(context.profile, branchId) || !hasCommercePermission(context.profile, 'pos.return', branchId) || typeof body.register_session_id !== 'string' || typeof body.original_sale_id !== 'string' || !Array.isArray(body.items) || !Array.isArray(body.refunds) || typeof body.reason !== 'string' || typeof body.idempotency_key !== 'string') return NextResponse.json({ error: 'ข้อมูลคืนสินค้าไม่ถูกต้อง' }, { status: 400 });

    const admin = requireSupabaseAdmin();
    const { data, error } = await admin.rpc('commerce_finalize_sale_return', {
      p_user_id: context.profile.id,
      p_branch_id: branchId,
      p_register_session_id: body.register_session_id,
      p_original_sale_id: body.original_sale_id,
      p_items: body.items,
      p_refunds: body.refunds,
      p_reason: body.reason,
      p_idempotency_key: body.idempotency_key,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ result: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to complete return' }, { status: 500 });
  }
}
