import { NextResponse } from 'next/server';
import {
  canAccessCommerceBranch,
  getCommerceRequestContext,
  hasCommercePermission,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';
import { toNumber } from '@/lib/commerce';

async function resolveBranch(request: Request) {
  const context = await getCommerceRequestContext(request);
  if (!context) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = requireSupabaseAdmin();
  const queryBranchId = new URL(request.url).searchParams.get('branch_id');
  let branchId = queryBranchId || context.profile.commercePreferences?.lastBranchId || '';
  if (!branchId && !context.profile.commercePreferences) {
    const { data, error } = await admin.from('commerce_user_preferences').select('last_branch_id').eq('user_id', context.profile.id).maybeSingle();
    if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
    branchId = data?.last_branch_id || '';
  }
  if (!branchId || !canAccessCommerceBranch(context.profile, branchId)) return { error: NextResponse.json({ error: 'ไม่มีสิทธิ์ใช้สต๊อกของสาขานี้' }, { status: 403 }) };
  if (!hasCommercePermission(context.profile, 'inventory.read', branchId)) return { error: NextResponse.json({ error: 'ไม่มีสิทธิ์ดูสต๊อกของสาขานี้' }, { status: 403 }) };
  return { context, admin, branchId };
}

export async function GET(request: Request) {
  try {
    const selected = await resolveBranch(request);
    if ('error' in selected) return selected.error;
    const productId = new URL(request.url).searchParams.get('product_id') || '';
    if (!productId) return NextResponse.json({ error: 'ต้องระบุสินค้า' }, { status: 400 });
    const { admin, branchId } = selected;
    const [productResult, unitsResult, balancesResult] = await Promise.all([
      admin.from('products').select('id, name, sku, base_unit_code, unit_inventory_mode, image_url').eq('id', productId).maybeSingle(),
      admin.from('product_units').select('id, code, name, conversion_to_base, is_default, allow_decimal, can_sell, can_receive, image_url').eq('product_id', productId).order('is_default', { ascending: false }).order('created_at'),
      admin.from('stock_unit_balances').select('product_unit_id, on_hand, reserved, damaged, in_transit, updated_at').eq('branch_id', branchId).eq('product_id', productId),
    ]);
    const error = productResult.error || unitsResult.error || balancesResult.error;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!productResult.data) return NextResponse.json({ error: 'ไม่พบสินค้า' }, { status: 404 });
    const product = productResult.data;
    const balances = new Map((balancesResult.data || []).map((balance) => [String(balance.product_unit_id), balance]));
    return NextResponse.json({
      branchId,
      product,
      units: (unitsResult.data || []).map((unit) => {
        const balance = balances.get(String(unit.id));
        return {
          ...unit,
          image_url: unit.image_url || product.image_url || null,
          on_hand: toNumber(balance?.on_hand),
          reserved: toNumber(balance?.reserved),
          damaged: toNumber(balance?.damaged),
          in_transit: toNumber(balance?.in_transit),
          available: Math.max(0, toNumber(balance?.on_hand) - toNumber(balance?.reserved) - toNumber(balance?.damaged)),
        };
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'โหลดสต๊อกตามหน่วยไม่สำเร็จ' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const selected = await resolveBranch(request);
    if ('error' in selected) return selected.error;
    const { context, admin, branchId } = selected;
    if (!hasCommercePermission(context.profile, 'inventory.adjust', branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์ปรับสต๊อกหรือแปลงหน่วย' }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const productId = typeof body.product_id === 'string' ? body.product_id : '';
    const action = body.action === 'adjust' ? 'adjust' : body.action === 'convert' ? 'convert' : '';
    if (!productId || !action) return NextResponse.json({ error: 'ข้อมูลรายการหน่วยไม่ถูกต้อง' }, { status: 400 });

    if (action === 'adjust') {
      const unitId = typeof body.product_unit_id === 'string' ? body.product_unit_id : '';
      const quantityAfter = Number(body.quantity_after);
      if (!unitId || !Number.isFinite(quantityAfter) || quantityAfter < 0 || typeof body.reason !== 'string' || !body.reason.trim()) return NextResponse.json({ error: 'กรอกหน่วย จำนวน และเหตุผลให้ครบถ้วน' }, { status: 400 });
      const { data, error } = await admin.rpc('commerce_adjust_stock_unit', {
        p_user_id: context.profile.id,
        p_branch_id: branchId,
        p_product_id: productId,
        p_product_unit_id: unitId,
        p_quantity_after: quantityAfter,
        p_reason: body.reason,
        p_note: typeof body.note === 'string' ? body.note : null,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ result: data });
    }

    const sourceUnitId = typeof body.source_unit_id === 'string' ? body.source_unit_id : '';
    const targetUnitId = typeof body.target_unit_id === 'string' ? body.target_unit_id : '';
    const sourceQuantity = Number(body.source_quantity);
    const targetQuantity = body.target_quantity === '' || body.target_quantity === null || body.target_quantity === undefined ? null : Number(body.target_quantity);
    if (!sourceUnitId || !targetUnitId || !Number.isFinite(sourceQuantity) || sourceQuantity <= 0 || (targetQuantity !== null && (!Number.isFinite(targetQuantity) || targetQuantity <= 0))) return NextResponse.json({ error: 'กรอกหน่วยต้นทาง ปลายทาง และจำนวนให้ถูกต้อง' }, { status: 400 });
    const { data, error } = await admin.rpc('commerce_convert_stock_units', {
      p_user_id: context.profile.id,
      p_branch_id: branchId,
      p_product_id: productId,
      p_source_unit_id: sourceUnitId,
      p_source_quantity: sourceQuantity,
      p_target_unit_id: targetUnitId,
      p_target_quantity: targetQuantity,
      p_note: typeof body.note === 'string' ? body.note : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ result: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'บันทึกสต๊อกตามหน่วยไม่สำเร็จ' }, { status: 500 });
  }
}
