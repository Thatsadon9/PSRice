import { NextResponse } from 'next/server';
import {
  canAccessCommerceBranch,
  canManageCommerce,
  getCommerceRequestContext,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);

    if (!context || !canManageCommerce(context.profile)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์รับสินค้าเข้าสต๊อก' }, { status: 403 });
    }

    const body = await request.json();
    const branchId = typeof body.branch_id === 'string' ? body.branch_id : '';
    const productId = typeof body.product_id === 'string' ? body.product_id : '';
    const quantity = Number(body.quantity);

    if (!branchId || !productId || !Number.isFinite(quantity) || quantity <= 0 || !canAccessCommerceBranch(context.profile, branchId)) {
      return NextResponse.json({ error: 'ข้อมูลรับสินค้าไม่ถูกต้อง' }, { status: 400 });
    }

    const admin = requireSupabaseAdmin();
    const { data, error } = await admin.rpc('commerce_receive_stock', {
      p_user_id: context.profile.id,
      p_branch_id: branchId,
      p_product_id: productId,
      p_quantity: quantity,
      p_movement_type: 'opening',
      p_note: typeof body.note === 'string' ? body.note : null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ result: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to receive stock';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
