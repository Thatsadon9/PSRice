import { NextResponse } from 'next/server';
import {
  canManageCommerce,
  getCommerceRequestContext,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';

const CUSTOMER_PRICE_TYPES = ['member', 'wholesale', 'dealer'] as const;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const CATALOG_METADATA_TTL = 15_000;
const SORT_COLUMNS = {
  updated: 'updated_at',
  name: 'name',
  sku: 'sku',
  price_high: 'default_sale_price',
  price_low: 'default_sale_price',
} as const;

type PriceRuleInput = {
  customer_type?: unknown;
  enabled?: unknown;
  minimum_quantity?: unknown;
  price?: unknown;
};

type CatalogMetadata = {
  categories: Array<{ id: string; name: string; sort_order: number; is_active: boolean }>;
  summary: { total: number; active: number; missingImage: number };
};

let catalogMetadataCache: { value: CatalogMetadata; expiresAt: number } | null = null;
let catalogMetadataRequest: Promise<CatalogMetadata> | null = null;

async function loadCatalogMetadata() {
  if (catalogMetadataCache && catalogMetadataCache.expiresAt > Date.now()) {
    return catalogMetadataCache.value;
  }
  if (catalogMetadataRequest) return catalogMetadataRequest;

  catalogMetadataRequest = (async () => {
    const admin = requireSupabaseAdmin();
    const [categoriesResult, allCountResult, activeCountResult, missingImageCountResult] = await Promise.all([
      admin.from('product_categories').select('id, name, sort_order, is_active').order('sort_order').order('name'),
      admin.from('products').select('id', { count: 'exact', head: true }),
      admin.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
      admin.from('products').select('id', { count: 'exact', head: true }).is('image_url', null),
    ]);
    const error = [categoriesResult.error, allCountResult.error, activeCountResult.error, missingImageCountResult.error].find(Boolean);
    if (error) throw error;

    const value: CatalogMetadata = {
      categories: categoriesResult.data || [],
      summary: {
        total: allCountResult.count || 0,
        active: activeCountResult.count || 0,
        missingImage: missingImageCountResult.count || 0,
      },
    };
    catalogMetadataCache = { value, expiresAt: Date.now() + CATALOG_METADATA_TTL };
    return value;
  })().finally(() => {
    catalogMetadataRequest = null;
  });

  return catalogMetadataRequest;
}

function invalidateCatalogMetadata() {
  catalogMetadataCache = null;
}

function nullableNumber(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function priceRules(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const rule = entry as PriceRuleInput;
    const customerType = String(rule.customer_type || '');
    const price = Number(rule.price);
    const minimumQuantity = Number(rule.minimum_quantity || 1);
    if (
      rule.enabled !== true
      || !CUSTOMER_PRICE_TYPES.includes(customerType as (typeof CUSTOMER_PRICE_TYPES)[number])
      || !Number.isFinite(price)
      || price < 0
      || !Number.isFinite(minimumQuantity)
      || minimumQuantity <= 0
    ) return [];
    return [{ customer_type: customerType, minimum_quantity: minimumQuantity, price }];
  });
}

function productErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('products_sku_key') || normalized.includes('duplicate') && normalized.includes('sku')) {
    return 'SKU นี้มีอยู่ในระบบแล้ว';
  }
  if (normalized.includes('barcode') && normalized.includes('duplicate')) {
    return 'บาร์โค้ดนี้มีอยู่ในระบบแล้ว';
  }
  return message;
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function escapePostgrestPattern(value: string) {
  return value.replace(/[%,()]/g, (character) => `\\${character}`);
}

export async function GET(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = requireSupabaseAdmin();
    const url = new URL(request.url);
    const page = positiveInteger(url.searchParams.get('page'), 1);
    const pageSize = Math.min(positiveInteger(url.searchParams.get('page_size'), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const search = url.searchParams.get('q')?.trim().slice(0, 120) || '';
    const categoryId = url.searchParams.get('category_id') || '';
    const status = url.searchParams.get('status') || 'all';
    const sort = url.searchParams.get('sort') || 'updated';
    const sortColumn = SORT_COLUMNS[sort as keyof typeof SORT_COLUMNS] || SORT_COLUMNS.updated;
    const ascending = sort === 'name' || sort === 'sku' || sort === 'price_low';
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let productsQuery = admin
      .from('products')
      .select('id, sku, barcode, name, brand, image_url, category_id, base_unit_code, default_sale_price, default_cost_price, reorder_point, is_active, track_inventory, is_weighted, allow_branch_price, tax_rate, weight_kg, area_sqm, unit_inventory_mode, updated_at, product_units(id, product_id, code, name, conversion_to_base, allow_decimal, is_default, can_sell, can_receive)', { count: 'exact' })
      .order(sortColumn, { ascending })
      .range(from, to);
    if (search) {
      const pattern = `%${escapePostgrestPattern(search)}%`;
      productsQuery = productsQuery.or(`name.ilike.${pattern},sku.ilike.${pattern},barcode.ilike.${pattern},brand.ilike.${pattern}`);
    }
    if (categoryId) productsQuery = productsQuery.eq('category_id', categoryId);
    if (status === 'active') productsQuery = productsQuery.eq('is_active', true);
    if (status === 'inactive') productsQuery = productsQuery.eq('is_active', false);
    if (status === 'missing_image') productsQuery = productsQuery.is('image_url', null);
    productsQuery = productsQuery.eq('product_units.is_default', true);

    const [productsResult, metadata] = await Promise.all([
      productsQuery,
      loadCatalogMetadata(),
    ]);
    if (productsResult.error) return NextResponse.json({ error: productsResult.error.message }, { status: 500 });

    const categories = metadata.categories;
    const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));

    return NextResponse.json({
      categories,
      products: (productsResult.data || []).map((product) => {
        const { product_units: units, ...productFields } = product;
        return {
          ...productFields,
          category_name: product.category_id ? categoryNameById.get(product.category_id) || null : null,
          default_unit: units?.[0] || null,
        };
      }),
      pagination: {
        page,
        pageSize,
        total: productsResult.count || 0,
        totalPages: Math.max(1, Math.ceil((productsResult.count || 0) / pageSize)),
      },
      summary: metadata.summary,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'โหลดสินค้าไม่สำเร็จ' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);

    if (!context || !canManageCommerce(context.profile)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการสินค้า' }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;
    const sku = typeof body.sku === 'string' ? body.sku.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const unitName = typeof body.unit_name === 'string' ? body.unit_name.trim() : '';
    const unitCode = typeof body.unit_code === 'string' ? body.unit_code.trim().toLowerCase() : '';
    const salePrice = Number(body.sale_price);
    const costPrice = Number(body.cost_price || 0);
    const conversion = Number(body.conversion_to_base || 1);
    const categoryId = typeof body.category_id === 'string' && body.category_id ? body.category_id : null;
    const isWeighted = body.is_weighted === true;
    const unitInventoryMode = body.unit_inventory_mode === 'separate_unit' ? 'separate_unit' : 'shared_base';

    if (!sku || !name || !unitName || !unitCode || !Number.isFinite(salePrice) || salePrice < 0 || !Number.isFinite(conversion) || conversion <= 0) {
      return NextResponse.json({ error: 'ระบุ SKU ชื่อสินค้า หน่วย และราคาขายให้ถูกต้อง' }, { status: 400 });
    }

    const admin = requireSupabaseAdmin();
    if (categoryId) {
      const { data: category, error: categoryError } = await admin
        .from('product_categories')
        .select('id')
        .eq('id', categoryId)
        .eq('is_active', true)
        .maybeSingle();
      if (categoryError || !category) {
        return NextResponse.json({ error: 'ไม่พบหมวดสินค้าที่เลือก' }, { status: 400 });
      }
    }

    const barcode = typeof body.barcode === 'string' && body.barcode.trim() ? body.barcode.trim() : null;
    const { data: product, error: productError } = await admin
      .from('products')
      .insert({
        sku,
        name,
        category_id: categoryId,
        barcode,
        brand: typeof body.brand === 'string' && body.brand.trim() ? body.brand.trim() : null,
        description: typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null,
        base_unit_code: unitCode,
        default_sale_price: salePrice,
        default_cost_price: Number.isFinite(costPrice) && costPrice >= 0 ? costPrice : 0,
        reorder_point: Number.isFinite(Number(body.reorder_point)) && Number(body.reorder_point) >= 0 ? Number(body.reorder_point) : 0,
        is_active: body.is_active !== false,
        track_inventory: body.track_inventory !== false,
        is_weighted: isWeighted,
        allow_branch_price: body.allow_branch_price === true,
        tax_rate: Number(body.tax_rate) === 7 ? 7 : 0,
        weight_kg: nullableNumber(body.weight_kg),
        area_sqm: nullableNumber(body.area_sqm),
        unit_inventory_mode: unitInventoryMode,
        created_by: context.profile.id,
      })
      .select('id, sku, name')
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: productErrorMessage(productError?.message || 'สร้างสินค้าไม่สำเร็จ') }, { status: 400 });
    }

    const { data: unit, error: unitError } = await admin
      .from('product_units')
      .insert({
        product_id: product.id,
        code: unitCode,
        name: unitName,
        conversion_to_base: conversion,
        is_default: true,
        allow_decimal: isWeighted || body.allow_decimal !== false,
      })
      .select('id')
      .single();

    if (unitError || !unit) {
      await admin.from('products').delete().eq('id', product.id);
      return NextResponse.json({ error: productErrorMessage(unitError?.message || 'สร้างหน่วยสินค้าไม่สำเร็จ') }, { status: 400 });
    }

    const rules = priceRules(body.price_rules);
    if (rules.length) {
      const { error: priceError } = await admin.from('product_prices').insert(rules.map((rule) => ({
        product_id: product.id,
        product_unit_id: unit.id,
        branch_id: null,
        ...rule,
        priority: 200,
        is_active: true,
        is_inventory_default: false,
      })));
      if (priceError) {
        await admin.from('products').delete().eq('id', product.id);
        return NextResponse.json({ error: priceError.message }, { status: 400 });
      }
    }

    await admin.from('commerce_audit_logs').insert({
      actor_user_id: context.profile.id,
      action: 'catalog.product.created',
      entity_type: 'product',
      entity_id: product.id,
      payload: { sku, name },
    });

    invalidateCatalogMetadata();
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create product';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
