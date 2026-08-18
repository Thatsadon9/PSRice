import { NextResponse } from 'next/server';
import {
  getCommerceRequestContext,
  hasCommercePermission,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';

type AvailabilityRequest = {
  branch_id?: unknown;
  product_id?: unknown;
  product_ids?: unknown;
  is_active?: unknown;
};

async function getManageableBranches(request: Request) {
  const context = await getCommerceRequestContext(request);
  if (!context) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const admin = requireSupabaseAdmin();
  const { data: allBranches, error } = await admin.from('branches').select('id, code, name').order('name');
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };

  const branches = (allBranches || []).filter((branch) =>
    hasCommercePermission(context.profile, 'catalog.manage', branch.id),
  );
  if (!branches.length) {
    return { error: NextResponse.json({ error: 'ไม่มีสิทธิ์กำหนดสินค้าที่ขายในสาขา' }, { status: 403 }) };
  }

  return { context, admin, branches };
}

function validIds(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))]
    : [];
}

export async function GET(request: Request) {
  try {
    const result = await getManageableBranches(request);
    if ('error' in result) return result.error;

    const { admin, branches } = result;
    const productId = new URL(request.url).searchParams.get('product_id');
    const productsQuery = admin
      .from('products')
      .select('id, sku, barcode, name, category_id, is_active')
      .order('name');
    const overridesQuery = admin
      .from('branch_product_availability')
      .select('branch_id, product_id, is_active, updated_at')
      .in('branch_id', branches.map((branch) => branch.id));

    const [productsResult, categoriesResult, overridesResult] = await Promise.all([
      productId ? productsQuery.eq('id', productId) : productsQuery.limit(2500),
      admin.from('product_categories').select('id, name').order('sort_order').order('name'),
      productId ? overridesQuery.eq('product_id', productId) : overridesQuery,
    ]);
    const firstError = [productsResult.error, categoriesResult.error, overridesResult.error].find(Boolean);
    if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });
    if (productId && productsResult.data?.length !== 1) {
      return NextResponse.json({ error: 'ไม่พบสินค้าที่ต้องการตั้งค่า' }, { status: 404 });
    }

    return NextResponse.json({
      branches,
      categories: categoriesResult.data || [],
      products: productsResult.data || [],
      overrides: overridesResult.data || [],
      defaultAvailability: true,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'ไม่สามารถโหลดการตั้งค่าสินค้ารายสาขาได้' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const result = await getManageableBranches(request);
    if ('error' in result) return result.error;

    const { context, admin, branches } = result;
    const body = await request.json() as AvailabilityRequest;
    const branchId = typeof body.branch_id === 'string' ? body.branch_id : '';
    const productIds = validIds(body.product_ids);
    if (typeof body.product_id === 'string' && body.product_id) productIds.push(body.product_id);
    const uniqueProductIds = [...new Set(productIds)];

    if (!branchId || !branches.some((branch) => branch.id === branchId) || !uniqueProductIds.length || typeof body.is_active !== 'boolean') {
      return NextResponse.json({ error: 'ข้อมูลการตั้งค่าสาขาหรือสินค้าไม่ถูกต้อง' }, { status: 400 });
    }

    const { data: products, error: productError } = await admin
      .from('products')
      .select('id')
      .in('id', uniqueProductIds);
    if (productError) return NextResponse.json({ error: productError.message }, { status: 500 });
    if ((products || []).length !== uniqueProductIds.length) {
      return NextResponse.json({ error: 'พบสินค้าที่ไม่มีอยู่ในแคตตาล็อก' }, { status: 400 });
    }

    let mutationError: { message: string } | null = null;
    if (body.is_active) {
      const { error } = await admin
        .from('branch_product_availability')
        .delete()
        .eq('branch_id', branchId)
        .in('product_id', uniqueProductIds);
      mutationError = error;
    } else {
      const { error } = await admin
        .from('branch_product_availability')
        .upsert(
          uniqueProductIds.map((productId) => ({
            branch_id: branchId,
            product_id: productId,
            is_active: false,
            updated_by_user_id: context.profile.id,
          })),
          { onConflict: 'branch_id,product_id' },
        );
      mutationError = error;
    }
    if (mutationError) return NextResponse.json({ error: mutationError.message }, { status: 500 });

    const { error: auditError } = await admin.from('commerce_audit_logs').insert({
      actor_user_id: context.profile.id,
      branch_id: branchId,
      action: body.is_active ? 'catalog.branch_availability.enabled' : 'catalog.branch_availability.disabled',
      entity_type: 'product',
      entity_id: uniqueProductIds.length === 1 ? uniqueProductIds[0] : null,
      payload: { product_ids: uniqueProductIds, is_active: body.is_active },
    });
    if (auditError) return NextResponse.json({ error: auditError.message }, { status: 500 });

    return NextResponse.json({ branch_id: branchId, product_ids: uniqueProductIds, is_active: body.is_active });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'บันทึกการตั้งค่าสินค้ารายสาขาไม่สำเร็จ' }, { status: 500 });
  }
}
