import { NextResponse } from 'next/server';
import { canAccessCommerceBranch, canManageCommerce, getCommerceRequestContext, hasCommercePermission, requireSupabaseAdmin } from '@/lib/commerceServer';

const CUSTOMER_TYPES = ['retail', 'member', 'wholesale', 'dealer'] as const;

function priceSort(left: { branch_id: string | null; priority: number; minimum_quantity: number | string; created_at?: string }, right: { branch_id: string | null; priority: number; minimum_quantity: number | string; created_at?: string }) {
  const branchDifference = Number(Boolean(right.branch_id)) - Number(Boolean(left.branch_id));
  if (branchDifference) return branchDifference;
  const priorityDifference = Number(right.priority) - Number(left.priority);
  if (priorityDifference) return priorityDifference;
  const minimumDifference = Number(right.minimum_quantity) - Number(left.minimum_quantity);
  if (minimumDifference) return minimumDifference;
  return String(right.created_at || '').localeCompare(String(left.created_at || ''));
}

export async function GET(request: Request) {
  const context = await getCommerceRequestContext(request);
  if (!context || !canManageCommerce(context.profile)) return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });
  const productId = new URL(request.url).searchParams.get('product_id');
  if (!productId) return NextResponse.json({ error: 'ไม่พบสินค้า' }, { status: 400 });
  const admin = requireSupabaseAdmin();
  const [{ data: prices, error }, { data: branches, error: branchError }] = await Promise.all([
    admin.from('product_prices').select('id, product_unit_id, branch_id, customer_type, minimum_quantity, price, priority, is_active, starts_at, ends_at, is_inventory_default, created_at').eq('product_id', productId).is('promotion_id', null),
    admin.from('branches').select('id, name').order('name'),
  ]);
  if (error || branchError) return NextResponse.json({ error: error?.message || branchError?.message }, { status: 500 });
  const accessibleBranches = (branches || []).filter((branch) => canAccessCommerceBranch(context.profile, branch.id) && hasCommercePermission(context.profile, 'pricing.manage', branch.id));
  const accessibleBranchIds = new Set(accessibleBranches.map((branch) => branch.id));
  return NextResponse.json({
    prices: (prices || []).filter((price) => !price.branch_id || accessibleBranchIds.has(price.branch_id)).sort(priceSort),
    branches: accessibleBranches,
  });
}

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context || !canManageCommerce(context.profile)) return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการราคา' }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const branchId = typeof body.branch_id === 'string' && body.branch_id ? body.branch_id : null;
    if (branchId && (!canAccessCommerceBranch(context.profile, branchId) || !hasCommercePermission(context.profile, 'pricing.manage', branchId))) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ตั้งราคาสาขานี้' }, { status: 403 });
    }
    if (!branchId && !hasCommercePermission(context.profile, 'pricing.manage')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ตั้งราคากลาง' }, { status: 403 });
    }
    const customerType = String(body.customer_type || 'retail');
    const price = Number(body.price);
    const minimumQuantity = Number(body.minimum_quantity || 0);
    const priority = Number(body.priority || 0);
    const productId = typeof body.product_id === 'string' ? body.product_id : '';
    const unitId = typeof body.product_unit_id === 'string' ? body.product_unit_id : '';
    const startsAt = typeof body.starts_at === 'string' && body.starts_at ? new Date(body.starts_at) : null;
    const endsAt = typeof body.ends_at === 'string' && body.ends_at ? new Date(body.ends_at) : null;
    if (!productId || !unitId || !CUSTOMER_TYPES.includes(customerType as (typeof CUSTOMER_TYPES)[number]) || !Number.isFinite(price) || price < 0 || !Number.isFinite(minimumQuantity) || minimumQuantity < 0 || !Number.isFinite(priority) || !Number.isInteger(priority) || startsAt && Number.isNaN(startsAt.getTime()) || endsAt && Number.isNaN(endsAt.getTime()) || startsAt && endsAt && endsAt <= startsAt) {
      return NextResponse.json({ error: 'ข้อมูลราคา หรือช่วงเวลามีผลไม่ถูกต้อง' }, { status: 400 });
    }
    const admin = requireSupabaseAdmin();
    const { data: unit, error: unitError } = await admin.from('product_units').select('id').eq('id', unitId).eq('product_id', productId).maybeSingle();
    if (unitError || !unit) return NextResponse.json({ error: 'หน่วยขายไม่ตรงกับสินค้า' }, { status: 400 });

    const priceFields = {
      customer_type: customerType,
      minimum_quantity: minimumQuantity,
      price,
      priority: customerType === 'retail' && branchId ? Math.min(priority, 0) : priority,
      starts_at: startsAt?.toISOString() || null,
      ends_at: endsAt?.toISOString() || null,
      is_active: true,
    };
    let existingQuery = admin.from('product_prices')
      .select('id, is_inventory_default')
      .eq('product_id', productId)
      .eq('product_unit_id', unitId)
      .eq('customer_type', customerType)
      .eq('minimum_quantity', minimumQuantity)
      .is('promotion_id', null)
      .order('is_inventory_default', { ascending: false })
      .limit(1);
    existingQuery = branchId ? existingQuery.eq('branch_id', branchId) : existingQuery.is('branch_id', null);
    const existingResult = await existingQuery.maybeSingle();
    if (existingResult.error) return NextResponse.json({ error: existingResult.error.message }, { status: 500 });

    const query = existingResult.data
      ? admin.from('product_prices').update(priceFields).eq('id', existingResult.data.id).select().single()
      : admin.from('product_prices').insert({ product_id: productId, product_unit_id: unitId, branch_id: branchId, ...priceFields, is_inventory_default: false }).select().single();
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ price: data }, { status: existingResult.data ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'บันทึกราคาไม่สำเร็จ' }, { status: 500 });
  }
}
