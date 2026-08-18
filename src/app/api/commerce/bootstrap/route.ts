import { NextResponse } from 'next/server';
import {
  canAccessCommerceBranch,
  getCommerceRequestContext,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';
import { COMMERCE_PAYMENT_METHODS, DEFAULT_POS_BRANCH_SETTINGS, toNumber } from '@/lib/commerce';

export async function GET(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);

    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = requireSupabaseAdmin();
    const requestedCustomerType = new URL(request.url).searchParams.get('customer_type');
    const isSalesCatalog = new URL(request.url).searchParams.get('catalog') === 'pos';
    const customerType = ['retail', 'member', 'wholesale', 'dealer'].includes(requestedCustomerType || '') ? requestedCustomerType! : 'retail';
    const { data: allBranches, error: branchError } = await admin
      .from('branches')
      .select('id, name')
      .order('name');

    if (branchError) {
      return NextResponse.json({ error: branchError.message }, { status: 500 });
    }

    const availableBranches = (allBranches || []).filter((branch) => canAccessCommerceBranch(context.profile, branch.id));

    let lastBranchId = context.profile.commercePreferences?.lastBranchId || null;
    if (!context.profile.commercePreferences) {
      const { data: preference, error: preferenceError } = await admin
        .from('commerce_user_preferences')
        .select('last_branch_id')
        .eq('user_id', context.profile.id)
        .maybeSingle();
      if (preferenceError) return NextResponse.json({ error: preferenceError.message }, { status: 500 });
      lastBranchId = preference?.last_branch_id || null;
    }

    const preferredBranchId = lastBranchId && canAccessCommerceBranch(context.profile, lastBranchId)
      ? lastBranchId
      : null;
    const branchId = preferredBranchId;

    if (!branchId) {
      return NextResponse.json({ error: 'กรุณาเลือกสาขาก่อนเข้าใช้งานระบบ Commerce' }, { status: 409 });
    }

    const [productsResult, unitsResult, barcodesResult, categoriesResult, balancesResult, unitBalancesResult, sessionsResult, pricesResult, availabilityResult, posSettingsResult, unitSettingsResult] = await Promise.all([
      admin.from('products').select('id, sku, barcode, name, brand, image_url, category_id, base_unit_code, default_sale_price, default_cost_price, unit_inventory_mode').eq('is_active', true).order('name'),
      admin.from('product_units').select('id, product_id, code, name, barcode, image_url, conversion_to_base, is_default, can_sell, can_receive').order('is_default', { ascending: false }),
      admin.from('product_barcodes').select('product_id, product_unit_id, barcode'),
      admin.from('product_categories').select('id, name, sort_order').eq('is_active', true).order('sort_order').order('name'),
      admin.from('stock_balances').select('product_id, on_hand, reserved, damaged, in_transit').eq('branch_id', branchId),
      admin.from('stock_unit_balances').select('product_id, product_unit_id, on_hand, reserved, damaged, in_transit').eq('branch_id', branchId),
      admin.from('pos_register_sessions').select('id, register_name, opening_float, expected_cash, opened_at').eq('branch_id', branchId).eq('opened_by_user_id', context.profile.id).eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('product_prices').select('product_id, product_unit_id, branch_id, price, minimum_quantity, priority, created_at').eq('customer_type', customerType).eq('is_active', true).or(`branch_id.is.null,branch_id.eq.${branchId}`).lte('minimum_quantity', 1).or('starts_at.is.null,starts_at.lte.now()').or('ends_at.is.null,ends_at.gt.now()'),
      isSalesCatalog
        ? admin.from('branch_product_availability').select('product_id').eq('branch_id', branchId).eq('is_active', false)
        : Promise.resolve({ data: [], error: null }),
      admin.from('pos_branch_settings').select('promptpay_enabled, promptpay_display_name, default_register_name, require_open_register, show_out_of_stock, enabled_payment_methods, receipt_footer').eq('branch_id', branchId).maybeSingle(),
      admin.from('branch_product_unit_settings').select('product_id, product_unit_id, cost_price, reorder_point').eq('branch_id', branchId),
    ]);

    const firstError = [productsResult.error, unitsResult.error, barcodesResult.error, categoriesResult.error, balancesResult.error, unitBalancesResult.error, sessionsResult.error, pricesResult.error, availabilityResult.error, posSettingsResult.error, unitSettingsResult.error].find(Boolean);

    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 });
    }

    const categoryById = new Map((categoriesResult.data || []).map((category) => [category.id, category.name]));
    const unitsByProductId = new Map<string, Array<Record<string, unknown>>>();

    (unitsResult.data || []).forEach((unit) => {
      const units = unitsByProductId.get(unit.product_id) || [];
      units.push(unit as unknown as Record<string, unknown>);
      unitsByProductId.set(unit.product_id, units);
    });

    const balanceByProductId = new Map((balancesResult.data || []).map((balance) => [balance.product_id, balance]));
    const unitBalanceById = new Map((unitBalancesResult.data || []).map((balance) => [String(balance.product_unit_id), balance]));
    const unitSettingsById = new Map((unitSettingsResult.data || []).map((setting) => [String(setting.product_unit_id), setting]));
    const barcodesByProductId = new Map<string, string[]>();
    (barcodesResult.data || []).forEach((barcode) => {
      const values = barcodesByProductId.get(barcode.product_id) || [];
      values.push(barcode.barcode);
      barcodesByProductId.set(barcode.product_id, values);
    });
    const priceCandidates = (pricesResult.data || []).sort((left, right) => {
      const branchDifference = Number(Boolean(right.branch_id)) - Number(Boolean(left.branch_id));
      if (branchDifference) return branchDifference;
      const priorityDifference = right.priority - left.priority;
      if (priorityDifference) return priorityDifference;
      const minimumDifference = Number(right.minimum_quantity) - Number(left.minimum_quantity);
      if (minimumDifference) return minimumDifference;
      return right.created_at.localeCompare(left.created_at);
    });
    const priceByUnit = new Map<string, { price: number; reason: string }>();
    priceCandidates.forEach((price) => {
      const key = `${price.product_id}:${price.product_unit_id}`;
      if (!priceByUnit.has(key)) priceByUnit.set(key, {
        price: toNumber(price.price),
        reason: price.priority >= 1000 ? 'ราคาโปรโมชั่น' : customerType === 'member' ? 'ราคาสมาชิก' : customerType === 'wholesale' ? `ราคาส่ง ${toNumber(price.minimum_quantity).toLocaleString('th-TH')} หน่วยขึ้นไป` : customerType === 'dealer' ? 'ราคาตัวแทน' : 'ราคาปลีก',
      });
    });
    const posSettings = {
      ...DEFAULT_POS_BRANCH_SETTINGS,
      promptpayEnabled: Boolean(posSettingsResult.data?.promptpay_enabled),
      promptpayDisplayName: posSettingsResult.data?.promptpay_display_name || null,
      defaultRegisterName: posSettingsResult.data?.default_register_name || DEFAULT_POS_BRANCH_SETTINGS.defaultRegisterName,
      requireOpenRegister: posSettingsResult.data?.require_open_register !== false,
      showOutOfStock: Boolean(posSettingsResult.data?.show_out_of_stock),
      enabledPaymentMethods: Array.isArray(posSettingsResult.data?.enabled_payment_methods)
        ? posSettingsResult.data.enabled_payment_methods.filter((method) => COMMERCE_PAYMENT_METHODS.includes(method as typeof COMMERCE_PAYMENT_METHODS[number])) as typeof COMMERCE_PAYMENT_METHODS
        : DEFAULT_POS_BRANCH_SETTINGS.enabledPaymentMethods,
      receiptFooter: posSettingsResult.data?.receipt_footer || null,
    };
    const disabledProductIds = new Set((availabilityResult.data || []).map((item) => item.product_id));
    const products = (productsResult.data || []).filter((product) => !disabledProductIds.has(product.id)).map((product) => {
      const balance = balanceByProductId.get(product.id);
      const available = Math.max(0, toNumber(balance?.on_hand) - toNumber(balance?.reserved) - toNumber(balance?.damaged));
      const unitInventoryMode = product.unit_inventory_mode === 'separate_unit' ? 'separate_unit' : 'shared_base';
      const productUnits = (unitsByProductId.get(product.id) || []).map((unit) => {
        const unitId = String(unit.id);
        const unitBalance = unitBalanceById.get(unitId);
        const unitSetting = unitSettingsById.get(unitId);
        const unitAvailable = unitInventoryMode === 'separate_unit'
          ? Math.max(0, toNumber(unitBalance?.on_hand) - toNumber(unitBalance?.reserved) - toNumber(unitBalance?.damaged))
          : Math.max(0, available / Math.max(0.001, toNumber(unit.conversion_to_base)));
        return {
        id: unitId,
        code: String(unit.code),
        name: String(unit.name),
        barcode: unit.barcode ? String(unit.barcode) : null,
        imageUrl: unit.image_url ? String(unit.image_url) : product.image_url ? String(product.image_url) : null,
        conversionToBase: toNumber(unit.conversion_to_base),
        isDefault: Boolean(unit.is_default),
        canSell: unit.can_sell !== false,
        canReceive: unit.can_receive !== false,
        costPrice: unitSetting?.cost_price == null ? toNumber(product.default_cost_price) * Math.max(0.001, toNumber(unit.conversion_to_base)) : toNumber(unitSetting.cost_price),
        reorderPoint: unitSetting?.reorder_point == null ? 0 : toNumber(unitSetting.reorder_point),
        available: unitAvailable,
        onHand: unitInventoryMode === 'separate_unit' ? toNumber(unitBalance?.on_hand) : available / Math.max(0.001, toNumber(unit.conversion_to_base)),
        reserved: unitInventoryMode === 'separate_unit' ? toNumber(unitBalance?.reserved) : toNumber(balance?.reserved) / Math.max(0.001, toNumber(unit.conversion_to_base)),
        damaged: unitInventoryMode === 'separate_unit' ? toNumber(unitBalance?.damaged) : toNumber(balance?.damaged) / Math.max(0.001, toNumber(unit.conversion_to_base)),
        salePrice: priceByUnit.get(`${product.id}:${String(unit.id)}`)?.price ?? toNumber(product.default_sale_price) * toNumber(unit.conversion_to_base),
        priceReason: priceByUnit.get(`${product.id}:${String(unit.id)}`)?.reason ?? (customerType === 'member' ? 'ราคาสมาชิก' : customerType === 'wholesale' ? 'ราคาส่ง' : customerType === 'dealer' ? 'ราคาตัวแทน' : 'ราคาปลีก'),
        };
      });
      const defaultUnit = productUnits.find((unit) => unit.isDefault) || productUnits[0];

      return {
        id: product.id,
        sku: product.sku,
        barcode: product.barcode,
        barcodes: [...new Set([product.barcode, ...(barcodesByProductId.get(product.id) || []), ...productUnits.map((unit) => unit.barcode)].filter((value): value is string => Boolean(value)))],
        name: product.name,
        brand: product.brand,
        imageUrl: product.image_url,
        categoryName: product.category_id ? categoryById.get(product.category_id) || null : null,
        defaultSalePrice: defaultUnit ? defaultUnit.salePrice : toNumber(product.default_sale_price),
        defaultCostPrice: toNumber(product.default_cost_price),
        priceReason: customerType === 'member' ? 'ราคาสมาชิก' : customerType === 'wholesale' ? 'ราคาส่ง' : customerType === 'dealer' ? 'ราคาตัวแทน' : 'ราคาปลีก',
        baseUnitCode: product.base_unit_code,
        available,
        onHand: toNumber(balance?.on_hand),
        reserved: toNumber(balance?.reserved),
        damaged: toNumber(balance?.damaged),
        inTransit: toNumber(balance?.in_transit),
        units: productUnits,
        unitInventoryMode,
      };
    });

    const filteredProducts = isSalesCatalog && !posSettings.showOutOfStock
      ? products.filter((product) => product.units.some((unit) => unit.canSell && unit.available > 0))
      : products;
    const session = sessionsResult.data
      ? {
          id: sessionsResult.data.id,
          registerName: sessionsResult.data.register_name,
          openingFloat: toNumber(sessionsResult.data.opening_float),
          expectedCash: toNumber(sessionsResult.data.expected_cash),
          openedAt: sessionsResult.data.opened_at,
        }
      : null;

    return NextResponse.json({
      branches: availableBranches,
      categories: (categoriesResult.data || []).map((category) => ({
        id: category.id,
        name: category.name,
        sortOrder: category.sort_order,
      })),
      branchId,
      products: filteredProducts,
      registerSession: session,
      posSettings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load POS data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
