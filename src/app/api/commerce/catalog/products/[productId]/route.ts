import { NextResponse } from 'next/server';
import {
  canAccessCommerceBranch,
  canManageCommerce,
  getCommerceRequestContext,
  hasCommercePermission,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';

type RouteContext = { params: Promise<{ productId: string }> };

const CUSTOMER_PRICE_TYPES = ['member', 'wholesale', 'dealer'] as const;

function nullableNumber(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function duplicateMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('sku')) return 'SKU นี้มีอยู่ในระบบแล้ว';
  if (normalized.includes('barcode')) return 'บาร์โค้ดนี้มีอยู่ในระบบแล้ว';
  return message;
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { productId } = await params;
    const admin = requireSupabaseAdmin();

    const [productResult, unitsResult, pricesResult, branchesResult] = await Promise.all([
      admin
        .from('products')
        .select('id, sku, barcode, name, brand, description, image_url, category_id, base_unit_code, default_sale_price, default_cost_price, reorder_point, is_active, track_inventory, is_weighted, allow_branch_price, tax_rate, weight_kg, area_sqm, unit_inventory_mode, updated_at')
        .eq('id', productId)
        .maybeSingle(),
      admin
        .from('product_units')
        .select('id, code, name, barcode, image_url, conversion_to_base, allow_decimal, is_default, can_sell, can_receive')
        .eq('product_id', productId)
        .order('is_default', { ascending: false })
        .order('created_at'),
      admin
        .from('product_prices')
        .select('id, product_unit_id, branch_id, customer_type, minimum_quantity, price, priority, is_active, starts_at, ends_at, is_inventory_default')
        .eq('product_id', productId)
        .is('promotion_id', null)
        .eq('is_active', true)
        .order('priority', { ascending: false }),
      admin.from('branches').select('id, name').order('name'),
    ]);
    const error = [productResult.error, unitsResult.error, pricesResult.error, branchesResult.error].find(Boolean);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!productResult.data) return NextResponse.json({ error: 'ไม่พบสินค้า' }, { status: 404 });

    const branches = (branchesResult.data || []).filter((branch) => canAccessCommerceBranch(context.profile, branch.id) && hasCommercePermission(context.profile, 'pricing.manage', branch.id));
    const accessibleBranchIds = new Set(branches.map((branch) => branch.id));
    const prices = (pricesResult.data || []).filter((price) => !price.branch_id || accessibleBranchIds.has(price.branch_id));
    const defaultUnitId = (unitsResult.data || []).find((unit) => unit.is_default)?.id || unitsResult.data?.[0]?.id;

    return NextResponse.json({
      product: productResult.data,
      units: unitsResult.data || [],
      branches,
      prices,
      price_rules: prices.filter((price) => price.product_unit_id === defaultUnitId && !price.branch_id && !price.is_inventory_default && CUSTOMER_PRICE_TYPES.includes(price.customer_type as (typeof CUSTOMER_PRICE_TYPES)[number])),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'โหลดรายละเอียดสินค้าไม่สำเร็จ' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context || !canManageCommerce(context.profile)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขสินค้า' }, { status: 403 });
    }

    const { productId } = await params;
    const body = await request.json() as Record<string, unknown>;
    const sku = typeof body.sku === 'string' ? body.sku.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const unitName = typeof body.unit_name === 'string' ? body.unit_name.trim() : '';
    const unitCode = typeof body.unit_code === 'string' ? body.unit_code.trim().toLowerCase() : '';
    const categoryId = typeof body.category_id === 'string' && body.category_id ? body.category_id : null;
    const salePrice = Number(body.sale_price);
    const costPrice = Number(body.cost_price || 0);
    const reorderPoint = Number(body.reorder_point || 0);
    const isWeighted = body.is_weighted === true;
    const requestedInventoryMode = body.unit_inventory_mode === 'separate_unit' ? 'separate_unit' : 'shared_base';

    if (
      !productId || !sku || !name || !unitName || !unitCode
      || !Number.isFinite(salePrice) || salePrice < 0
      || !Number.isFinite(costPrice) || costPrice < 0
      || !Number.isFinite(reorderPoint) || reorderPoint < 0
    ) {
      return NextResponse.json({ error: 'ข้อมูลสินค้า ราคา หรือหน่วยไม่ถูกต้อง' }, { status: 400 });
    }

    const admin = requireSupabaseAdmin();
    const [existingResult, defaultUnitResult] = await Promise.all([
      admin.from('products').select('*').eq('id', productId).maybeSingle(),
      admin.from('product_units').select('id').eq('product_id', productId).eq('is_default', true).maybeSingle(),
    ]);
    if (existingResult.error || defaultUnitResult.error) {
      return NextResponse.json({ error: existingResult.error?.message || defaultUnitResult.error?.message }, { status: 500 });
    }
    if (!existingResult.data || !defaultUnitResult.data) {
      return NextResponse.json({ error: 'ไม่พบสินค้าหรือหน่วยหลัก' }, { status: 404 });
    }
    const existingProduct = existingResult.data;
    const defaultUnitId = defaultUnitResult.data.id;

    if (requestedInventoryMode !== (existingProduct.unit_inventory_mode || 'shared_base')) {
      const { error: modeError } = await admin.rpc('commerce_enable_product_unit_inventory', {
        p_user_id: context.profile.id,
        p_product_id: productId,
        p_mode: requestedInventoryMode,
      });
      if (modeError) return NextResponse.json({ error: modeError.message }, { status: 400 });
    }

    if (categoryId) {
      const { data: category } = await admin.from('product_categories').select('id').eq('id', categoryId).eq('is_active', true).maybeSingle();
      if (!category) return NextResponse.json({ error: 'ไม่พบหมวดสินค้าที่เลือก' }, { status: 400 });
    }

    const barcode = typeof body.barcode === 'string' && body.barcode.trim() ? body.barcode.trim() : null;
    const duplicateChecks = await Promise.all([
      admin.from('products').select('id').eq('sku', sku).neq('id', productId).limit(1),
      barcode ? admin.from('products').select('id').eq('barcode', barcode).neq('id', productId).limit(1) : Promise.resolve({ data: [], error: null }),
    ]);
    if (duplicateChecks[0].error || duplicateChecks[1].error) {
      return NextResponse.json({ error: duplicateChecks[0].error?.message || duplicateChecks[1].error?.message }, { status: 500 });
    }
    if (duplicateChecks[0].data?.length) return NextResponse.json({ error: 'SKU นี้มีอยู่ในระบบแล้ว' }, { status: 409 });
    if (duplicateChecks[1].data?.length) return NextResponse.json({ error: 'บาร์โค้ดนี้มีอยู่ในระบบแล้ว' }, { status: 409 });

    const { data: product, error: productError } = await admin
      .from('products')
      .update({
        sku,
        name,
        category_id: categoryId,
        barcode,
        brand: typeof body.brand === 'string' && body.brand.trim() ? body.brand.trim() : null,
        description: typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null,
        base_unit_code: unitCode,
        default_sale_price: salePrice,
        default_cost_price: costPrice,
        reorder_point: reorderPoint,
        is_active: body.is_active !== false,
        track_inventory: body.track_inventory !== false,
        is_weighted: isWeighted,
        allow_branch_price: body.allow_branch_price === true,
        tax_rate: Number(body.tax_rate) === 7 ? 7 : 0,
        weight_kg: nullableNumber(body.weight_kg),
        area_sqm: nullableNumber(body.area_sqm),
        unit_inventory_mode: requestedInventoryMode,
      })
      .eq('id', productId)
      .select('id, sku, name')
      .single();
    if (productError || !product) {
      return NextResponse.json({ error: duplicateMessage(productError?.message || 'บันทึกสินค้าไม่สำเร็จ') }, { status: 400 });
    }

    const { error: unitError } = await admin
      .from('product_units')
      .update({
        code: unitCode,
        name: unitName,
        conversion_to_base: 1,
        allow_decimal: isWeighted || body.allow_decimal !== false,
      })
      .eq('id', defaultUnitId);
    if (unitError) return NextResponse.json({ error: duplicateMessage(unitError.message) }, { status: 400 });

    const requestedRules = Array.isArray(body.price_rules) ? body.price_rules : [];
    const rules = requestedRules.flatMap((entry) => {
      const rule = entry as Record<string, unknown>;
      const type = String(rule.customer_type || '');
      const price = Number(rule.price);
      const minimumQuantity = Number(rule.minimum_quantity || 1);
      if (
        rule.enabled !== true
        || !CUSTOMER_PRICE_TYPES.includes(type as (typeof CUSTOMER_PRICE_TYPES)[number])
        || !Number.isFinite(price) || price < 0
        || !Number.isFinite(minimumQuantity) || minimumQuantity <= 0
      ) return [];
      return [{ customer_type: type, price, minimum_quantity: minimumQuantity }];
    });

    const { error: deletePricesError } = await admin
      .from('product_prices')
      .delete()
      .eq('product_id', productId)
      .is('branch_id', null)
      .is('promotion_id', null)
      .eq('is_inventory_default', false)
      .in('customer_type', CUSTOMER_PRICE_TYPES);
    if (deletePricesError) return NextResponse.json({ error: deletePricesError.message }, { status: 500 });

    if (rules.length) {
      const { error: priceError } = await admin.from('product_prices').insert(rules.map((rule) => ({
        product_id: productId,
        product_unit_id: defaultUnitId,
        branch_id: null,
        ...rule,
        priority: 200,
        is_active: true,
        is_inventory_default: false,
      })));
      if (priceError) return NextResponse.json({ error: priceError.message }, { status: 400 });
    }

    await admin.from('commerce_audit_logs').insert({
      actor_user_id: context.profile.id,
      action: 'catalog.product.updated',
      entity_type: 'product',
      entity_id: productId,
      payload: {
        before: existingProduct,
        after: { ...body, price_rules: rules },
        sku,
        name,
      },
    });

    return NextResponse.json({ product });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'บันทึกสินค้าไม่สำเร็จ' }, { status: 500 });
  }
}
