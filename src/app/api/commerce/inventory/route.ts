import { NextResponse } from 'next/server';
import { toNumber } from '@/lib/commerce';
import {
  canAccessCommerceBranch,
  getCommerceRequestContext,
  hasCommercePermission,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';

async function getSelectedBranch(request: Request) {
  const context = await getCommerceRequestContext(request);
  if (!context) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const admin = requireSupabaseAdmin();
  let branchId = context.profile.commercePreferences?.lastBranchId || '';
  if (!context.profile.commercePreferences) {
    const { data: preference, error: preferenceError } = await admin
      .from('commerce_user_preferences')
      .select('last_branch_id')
      .eq('user_id', context.profile.id)
      .maybeSingle();
    if (preferenceError) return { error: NextResponse.json({ error: preferenceError.message }, { status: 500 }) };
    branchId = preference?.last_branch_id || '';
  }
  if (!branchId || !canAccessCommerceBranch(context.profile, branchId)) {
    return { error: NextResponse.json({ error: 'กรุณาเลือกสาขาก่อนเข้าใช้งานระบบ Commerce' }, { status: 409 }) };
  }

  if (!hasCommercePermission(context.profile, 'inventory.read', branchId)) {
    return { error: NextResponse.json({ error: 'ไม่มีสิทธิ์ดูสต๊อกของสาขานี้' }, { status: 403 }) };
  }

  const { data: branch, error: branchError } = await admin
    .from('branches')
    .select('id, code, name')
    .eq('id', branchId)
    .single();
  if (branchError) return { error: NextResponse.json({ error: branchError.message }, { status: 500 }) };

  return { context, admin, branchId, branch };
}

export async function GET(request: Request) {
  try {
    const selected = await getSelectedBranch(request);
    if ('error' in selected) return selected.error;
    const { context, admin, branchId, branch } = selected;

    const [productsResult, categoriesResult, unitsResult, balancesResult, unitBalancesResult, settingsResult, unitSettingsResult, availabilityResult, pricesResult] = await Promise.all([
      admin
        .from('products')
        .select('id, sku, barcode, name, image_url, category_id, base_unit_code, default_sale_price, default_cost_price, reorder_point, is_active, unit_inventory_mode, updated_at')
        .order('name')
        .limit(2500),
      admin.from('product_categories').select('id, name').order('sort_order').order('name'),
      admin.from('product_units').select('id, product_id, name, code, barcode, conversion_to_base, is_default, can_sell, can_receive, image_url, created_at').order('created_at'),
      admin.from('stock_balances').select('product_id, on_hand, reserved, damaged, in_transit, updated_at').eq('branch_id', branchId),
      admin.from('stock_unit_balances').select('product_id, product_unit_id, on_hand, reserved, damaged, in_transit, updated_at').eq('branch_id', branchId),
      admin.from('branch_inventory_settings').select('product_id, cost_price, reorder_point, note, updated_at').eq('branch_id', branchId),
      admin.from('branch_product_unit_settings').select('product_id, product_unit_id, cost_price, reorder_point, note, updated_at').eq('branch_id', branchId),
      admin.from('branch_product_availability').select('product_id, is_active, updated_at').eq('branch_id', branchId),
      admin.from('product_prices').select('product_id, product_unit_id, price, updated_at').eq('branch_id', branchId).eq('customer_type', 'retail').eq('is_inventory_default', true).eq('is_active', true),
    ]);
    const firstError = [productsResult.error, categoriesResult.error, unitsResult.error, balancesResult.error, unitBalancesResult.error, settingsResult.error, unitSettingsResult.error, availabilityResult.error, pricesResult.error].find(Boolean);
    if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

    const categoryById = new Map((categoriesResult.data || []).map((category) => [category.id, category.name]));
    const balanceByProductId = new Map((balancesResult.data || []).map((balance) => [balance.product_id, balance]));
    const unitBalanceById = new Map((unitBalancesResult.data || []).map((balance) => [String(balance.product_unit_id), balance]));
    const settingsByProductId = new Map((settingsResult.data || []).map((setting) => [setting.product_id, setting]));
    const unitSettingsById = new Map((unitSettingsResult.data || []).map((setting) => [String(setting.product_unit_id), setting]));
    const availabilityByProductId = new Map((availabilityResult.data || []).map((availability) => [availability.product_id, availability]));
    const priceByUnitId = new Map((pricesResult.data || []).map((price) => [String(price.product_unit_id), price]));
    const unitsByProductId = new Map<string, Array<Record<string, unknown>>>();
    (unitsResult.data || []).forEach((unit) => {
      const rows = unitsByProductId.get(unit.product_id) || [];
      rows.push(unit as unknown as Record<string, unknown>);
      unitsByProductId.set(unit.product_id, rows);
    });

    const items = (productsResult.data || []).flatMap((product) => {
      const balance = balanceByProductId.get(product.id);
      const setting = settingsByProductId.get(product.id);
      const availability = availabilityByProductId.get(product.id);
      const units = (unitsByProductId.get(product.id) || []).sort((left, right) => Number(Boolean(right.is_default)) - Number(Boolean(left.is_default)));
      const defaultUnit = units[0];
      const visibleUnits = product.unit_inventory_mode === 'separate_unit' ? units : [defaultUnit];

      return visibleUnits.filter(Boolean).map((unit) => {
        const unitId = String(unit.id);
        const unitBalance = unitBalanceById.get(unitId);
        const unitSetting = unitSettingsById.get(unitId);
        const isSeparate = product.unit_inventory_mode === 'separate_unit';
        const onHand = isSeparate ? toNumber(unitBalance?.on_hand) : toNumber(balance?.on_hand);
        const reserved = isSeparate ? toNumber(unitBalance?.reserved) : toNumber(balance?.reserved);
        const damaged = isSeparate ? toNumber(unitBalance?.damaged) : toNumber(balance?.damaged);
        const inTransit = isSeparate ? toNumber(unitBalance?.in_transit) : toNumber(balance?.in_transit);
        const available = Math.max(0, onHand - reserved - damaged);
        const salePrice = toNumber(priceByUnitId.get(unitId)?.price ?? product.default_sale_price * toNumber(unit.conversion_to_base));
        const costPrice = toNumber(isSeparate ? unitSetting?.cost_price ?? product.default_cost_price * toNumber(unit.conversion_to_base) : setting?.cost_price ?? product.default_cost_price);
        const reorderPoint = toNumber(isSeparate ? unitSetting?.reorder_point ?? product.reorder_point : setting?.reorder_point ?? product.reorder_point);
        const isActive = Boolean(product.is_active) && availability?.is_active !== false && unit.can_sell !== false;
        const status = !isActive ? 'inactive' : available <= 0 ? 'out' : available <= reorderPoint ? 'low' : 'normal';
        const updatedAtCandidates = [unitBalance?.updated_at, unitSetting?.updated_at, balance?.updated_at, setting?.updated_at, availability?.updated_at, product.updated_at]
          .filter((value): value is string => typeof value === 'string');

        return {
          id: isSeparate ? `${product.id}:${unitId}` : product.id,
          productId: product.id,
          sku: product.sku,
          barcode: unit.barcode ? String(unit.barcode) : product.barcode,
          name: product.name,
          imageUrl: unit.image_url || product.image_url,
          categoryId: product.category_id,
          categoryName: product.category_id ? categoryById.get(product.category_id) || null : null,
          unitId,
          unitName: String(unit.name),
          unitCode: String(unit.code),
          unitInventoryMode: isSeparate ? 'separate_unit' : 'shared_base',
          salePrice,
          costPrice,
          reorderPoint,
          onHand,
          reserved,
          damaged,
          inTransit,
          available,
          isActive,
          productIsActive: Boolean(product.is_active),
          status,
          note: unitSetting?.note || setting?.note || '',
          updatedAt: updatedAtCandidates.sort().at(-1) || null,
        };
      });
    });

    const summary = items.reduce((current, item) => {
      current.onHand += item.onHand;
      current.available += item.available;
      current.stockValue += item.onHand * item.costPrice;
      current.expectedProfit += item.available * Math.max(0, item.salePrice - item.costPrice);
      if (item.status === 'low') current.lowStock += 1;
      if (item.status === 'out') current.outOfStock += 1;
      return current;
    }, { onHand: 0, available: 0, stockValue: 0, expectedProfit: 0, lowStock: 0, outOfStock: 0 });

    return NextResponse.json({
      branch,
      categories: categoriesResult.data || [],
      items,
      summary,
      capabilities: {
        canAdjust: hasCommercePermission(context.profile, 'inventory.adjust', branchId),
        canManagePricing: hasCommercePermission(context.profile, 'pricing.manage', branchId),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'โหลดข้อมูลบริหารสต๊อกไม่สำเร็จ' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const selected = await getSelectedBranch(request);
    if ('error' in selected) return selected.error;
    const { context, admin, branchId } = selected;
    if (!hasCommercePermission(context.profile, 'inventory.adjust', branchId) || !hasCommercePermission(context.profile, 'pricing.manage', branchId)) {
      return NextResponse.json({ error: 'ต้องมีสิทธิ์ปรับสต๊อกและจัดการราคาเพื่อแก้ไขรายการนี้' }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;
    const productId = typeof body.product_id === 'string' ? body.product_id : '';
    const productUnitId = typeof body.product_unit_id === 'string' ? body.product_unit_id : '';
    const salePrice = Number(body.sale_price);
    const costPrice = Number(body.cost_price);
    const reorderPoint = Number(body.reorder_point);
    const quantityAfter = Number(body.quantity_after);
    const isActive = body.is_active;
    const note = typeof body.note === 'string' ? body.note : null;
    const stockReason = typeof body.stock_reason === 'string' ? body.stock_reason : null;

    if (!productId || ![salePrice, costPrice, reorderPoint, quantityAfter].every((value) => Number.isFinite(value) && value >= 0) || typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'ข้อมูลราคา ต้นทุน จุดสั่งซื้อ หรือจำนวนสต๊อกไม่ถูกต้อง' }, { status: 400 });
    }

    const { data: product, error: productError } = await admin.from('products').select('unit_inventory_mode').eq('id', productId).maybeSingle();
    if (productError) return NextResponse.json({ error: productError.message }, { status: 400 });
    if (!product) return NextResponse.json({ error: 'ไม่พบสินค้า' }, { status: 404 });

    const rpcName = product.unit_inventory_mode === 'separate_unit' ? 'commerce_configure_branch_inventory_unit_item' : 'commerce_configure_branch_inventory_item';
    if (product.unit_inventory_mode === 'separate_unit' && !productUnitId) {
      return NextResponse.json({ error: 'สินค้านี้ต้องเลือกหน่วยก่อนแก้ไขสต๊อก' }, { status: 400 });
    }
    const rpcPayload = product.unit_inventory_mode === 'separate_unit' ? {
      p_user_id: context.profile.id,
      p_branch_id: branchId,
      p_product_id: productId,
      p_product_unit_id: productUnitId,
      p_sale_price: salePrice,
      p_cost_price: costPrice,
      p_reorder_point: reorderPoint,
      p_quantity_after: quantityAfter,
      p_is_active: isActive,
      p_note: note,
      p_stock_reason: stockReason,
    } : {
      p_user_id: context.profile.id,
      p_branch_id: branchId,
      p_product_id: productId,
      p_sale_price: salePrice,
      p_cost_price: costPrice,
      p_reorder_point: reorderPoint,
      p_quantity_after: quantityAfter,
      p_is_active: isActive,
      p_note: note,
      p_stock_reason: stockReason,
    };
    const { data, error } = await admin.rpc(rpcName, rpcPayload);
    if (error) {
      const message = error.message.includes('stock adjustment reason is required')
        ? 'กรุณาระบุเหตุผลเมื่อแก้จำนวนสต๊อก'
        : error.message.includes('lower than reserved and damaged')
          ? 'ยอดคงเหลือใหม่ต้องไม่น้อยกว่าสินค้าที่จองและเสียหายรวมกัน'
          : error.message;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ result: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'บันทึกการตั้งค่าสต๊อกไม่สำเร็จ' }, { status: 500 });
  }
}
