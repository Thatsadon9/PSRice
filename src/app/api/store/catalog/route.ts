import { NextResponse } from 'next/server';
import { requireSupabaseAdmin } from '@/lib/commerceServer';
import { toNumber } from '@/lib/commerce';

export async function GET(request: Request) {
  try {
    const admin = requireSupabaseAdmin();
    const requestedBranchId = new URL(request.url).searchParams.get('branch_id');
    const { data: branches, error: branchError } = await admin.from('branches').select('id, name').order('name');
    if (branchError) return NextResponse.json({ error: 'ไม่สามารถโหลดสาขาได้' }, { status: 500 });
    const branchId = requestedBranchId || branches?.[0]?.id;
    if (!branchId || !branches?.some((branch) => branch.id === branchId)) return NextResponse.json({ error: 'ไม่พบสาขา' }, { status: 404 });

    const [productsResult, unitsResult, pricesResult, balancesResult, unitBalancesResult, availabilityResult] = await Promise.all([
      admin.from('products').select('id, sku, name, description, default_sale_price, category_id, unit_inventory_mode, product_categories(name)').eq('is_active', true).order('name'),
      admin.from('product_units').select('id, product_id, code, name, conversion_to_base, is_default, can_sell').order('is_default', { ascending: false }),
      admin.from('product_prices').select('product_id, product_unit_id, price, minimum_quantity, priority, branch_id, created_at').eq('customer_type', 'retail').eq('is_active', true).or(`branch_id.is.null,branch_id.eq.${branchId}`),
      admin.from('stock_balances').select('product_id, on_hand, reserved, damaged').eq('branch_id', branchId),
      admin.from('stock_unit_balances').select('product_id, product_unit_id, on_hand, reserved, damaged').eq('branch_id', branchId),
      admin.from('branch_product_availability').select('product_id').eq('branch_id', branchId).eq('is_active', false),
    ]);
    const error = [productsResult.error, unitsResult.error, pricesResult.error, balancesResult.error, unitBalancesResult.error, availabilityResult.error].find(Boolean);
    if (error) return NextResponse.json({ error: 'ไม่สามารถโหลดสินค้าได้' }, { status: 500 });

    const unitsByProduct = new Map<string, Array<{ id: string; code: string; name: string; conversionToBase: number; isDefault: boolean; canSell: boolean }>>();
    for (const unit of unitsResult.data || []) {
      const list = unitsByProduct.get(unit.product_id) || [];
      list.push({ id: unit.id, code: unit.code, name: unit.name, conversionToBase: toNumber(unit.conversion_to_base), isDefault: unit.is_default, canSell: unit.can_sell !== false });
      unitsByProduct.set(unit.product_id, list);
    }
    const balanceByProduct = new Map((balancesResult.data || []).map((balance) => [balance.product_id, balance]));
    const unitBalanceById = new Map((unitBalancesResult.data || []).map((balance) => [`${balance.product_id}:${balance.product_unit_id}`, balance]));
    const priceByUnit = new Map<string, number>();
    const priceCandidates = [...(pricesResult.data || [])].sort((left, right) => {
      const branchDifference = Number(Boolean(right.branch_id)) - Number(Boolean(left.branch_id));
      if (branchDifference) return branchDifference;
      const priorityDifference = Number(right.priority) - Number(left.priority);
      if (priorityDifference) return priorityDifference;
      const minimumDifference = Number(right.minimum_quantity) - Number(left.minimum_quantity);
      if (minimumDifference) return minimumDifference;
      return right.created_at.localeCompare(left.created_at);
    });
    for (const price of priceCandidates) {
      const key = `${price.product_id}:${price.product_unit_id}`;
      if (!priceByUnit.has(key)) priceByUnit.set(key, toNumber(price.price));
    }
    const disabledProductIds = new Set((availabilityResult.data || []).map((item) => item.product_id));
    const products = (productsResult.data || []).flatMap((product) => {
      if (disabledProductIds.has(product.id)) return [];
      const units = unitsByProduct.get(product.id) || [];
      const sellableUnits = units.filter((item) => item.canSell);
      const balance = balanceByProduct.get(product.id);
      const inventoryMode = product.unit_inventory_mode === 'separate_unit' ? 'separate_unit' : 'shared_base';
      const availableForUnit = (candidate: (typeof sellableUnits)[number]) => {
        const unitBalance = unitBalanceById.get(`${product.id}:${candidate.id}`);
        return inventoryMode === 'separate_unit'
          ? Math.max(0, toNumber(unitBalance?.on_hand) - toNumber(unitBalance?.reserved) - toNumber(unitBalance?.damaged))
          : Math.max(0, toNumber(balance?.on_hand) - toNumber(balance?.reserved) - toNumber(balance?.damaged)) / candidate.conversionToBase;
      };
      const defaultUnit = sellableUnits.find((item) => item.isDefault);
      const unit = (defaultUnit && availableForUnit(defaultUnit) >= 1 ? defaultUnit : sellableUnits.find((candidate) => availableForUnit(candidate) >= 1)) || defaultUnit || sellableUnits[0];
      const available = unit ? availableForUnit(unit) : 0;
      if (!unit || available < 1) return [];
      return [{
        id: product.id, sku: product.sku, name: product.name, description: product.description,
        categoryName: product.product_categories?.[0]?.name || null,
        unitInventoryMode: product.unit_inventory_mode === 'separate_unit' ? 'separate_unit' : 'shared_base',
        available, unit,
        unitPrice: priceByUnit.get(`${product.id}:${unit.id}`) ?? toNumber(product.default_sale_price) * unit.conversionToBase,
      }];
    });
    return NextResponse.json({ branchId, branches: branches || [], products });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'ไม่สามารถโหลดหน้าร้านได้' }, { status: 500 });
  }
}
