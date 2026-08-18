import { NextResponse } from 'next/server';
import {
  canAccessCommerceBranch,
  getCommerceRequestContext,
  hasCommercePermission,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';

type Relation<T> = T | T[] | null | undefined;
type ProductLookup = { id: string; name: string; sku: string | null; barcode: string | null; image_url: string | null; category_id: string | null; category_name?: string | null };
type UnitLookup = { id: string; product_id: string; name: string; code: string; conversion_to_base: number | string; image_url: string | null };
type RawItem = { id: string; purchase_order_item_id?: string | null; product_id: string; product_unit_id: string; quantity: number | string; base_quantity?: number | string; unit_cost: number | string };
type RawReceipt = { id: string; goods_receipt_number: string; branch_id: string; purchase_order_id: string | null; supplier_id?: string | null; received_at: string; created_at?: string; note: string | null; payment_method?: string | null; suppliers: Relation<{ name: string }>; purchase_orders: Relation<{ purchase_order_number: string }>; goods_receipt_items: RawItem[] };
type RawDraft = { id: string; draft_number: string; branch_id: string; purchase_order_id: string | null; supplier_id: string | null; received_at: string; payment_method: string; note: string | null; created_at: string; updated_at: string; suppliers: Relation<{ name: string; code?: string | null }>; purchase_orders: Relation<{ purchase_order_number: string }>; goods_receipt_draft_items: RawItem[] };
type DecoratedItem = RawItem & { product_name: string; sku: string | null; barcode: string | null; category_name: string | null; unit_name: string; unit_code: string; conversion_to_base: number; image_url: string | null };
type HistoryRow = { id: string; documentType: 'draft' | 'receipt'; documentNumber: string; status: 'draft' | 'completed'; source: 'po' | 'direct'; branchId: string; purchaseOrderId: string | null; purchaseOrderNumber: string | null; supplierId: string | null; supplierName: string | null; receivedAt: string; updatedAt: string; itemCount: number; totalQuantity: number; totalAmount: number; items: DecoratedItem[]; note: string | null; paymentMethod: string | null };

function one<T>(value: Relation<T>): T | null { return Array.isArray(value) ? value[0] || null : value || null; }
function numberValue(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function text(value: unknown) { return typeof value === 'string' ? value : ''; }
function normalize(value: unknown) { return text(value).trim().toLocaleLowerCase('th'); }
function dateOnly(value: string) { return value.slice(0, 10); }
function imageFor(product: ProductLookup | undefined, unit: UnitLookup | undefined) { return unit?.image_url || product?.image_url || null; }
function permissionAllowed(profile: Parameters<typeof canAccessCommerceBranch>[0], branchId: string) { return hasCommercePermission(profile, 'purchasing.receive', branchId) || hasCommercePermission(profile, 'purchasing.manage', branchId); }

async function loadLookups(admin: ReturnType<typeof requireSupabaseAdmin>, productIds: string[], unitIds: string[]) {
  const [productsResult, unitsResult] = await Promise.all([
    productIds.length ? admin.from('products').select('id, name, sku, barcode, image_url, category_id').in('id', productIds) : Promise.resolve({ data: [], error: null }),
    unitIds.length ? admin.from('product_units').select('id, product_id, name, code, conversion_to_base, image_url').in('id', unitIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (productsResult.error) throw productsResult.error;
  if (unitsResult.error) throw unitsResult.error;
  const products = (productsResult.data || []) as ProductLookup[];
  const units = (unitsResult.data || []) as UnitLookup[];
  const categoryIds = [...new Set(products.map((item) => item.category_id).filter((id): id is string => Boolean(id)))];
  const categoriesResult = categoryIds.length ? await admin.from('product_categories').select('id, name').in('id', categoryIds) : { data: [], error: null };
  if (categoriesResult.error) throw categoriesResult.error;
  const categoryNames = new Map((categoriesResult.data || []).map((item) => [item.id, item.name]));
  return {
    productMap: new Map(products.map((item) => [item.id, { ...item, category_name: item.category_id ? categoryNames.get(item.category_id) || null : null }])),
    unitMap: new Map(units.map((item) => [item.id, item])),
  };
}

function decorateItems(items: RawItem[], lookups: Awaited<ReturnType<typeof loadLookups>>) {
  return items.map((item) => {
    const product = lookups.productMap.get(item.product_id);
    const unit = lookups.unitMap.get(item.product_unit_id);
    return { ...item, product_name: product?.name || 'ไม่พบสินค้า', sku: product?.sku || null, barcode: product?.barcode || null, category_name: product?.category_name || null, unit_name: unit?.name || 'ไม่พบหน่วย', unit_code: unit?.code || '', conversion_to_base: numberValue(unit?.conversion_to_base || 1), image_url: imageFor(product, unit) };
  });
}

function totals(items: DecoratedItem[]) {
  return items.reduce((result, item) => ({ totalQuantity: result.totalQuantity + numberValue(item.quantity), totalAmount: result.totalAmount + numberValue(item.quantity) * numberValue(item.unit_cost) }), { totalQuantity: 0, totalAmount: 0 });
}

async function loadHistory(branchId: string) {
  const admin = requireSupabaseAdmin();
  const [receiptsResult, draftsResult, suppliersResult, ordersResult] = await Promise.all([
    admin.from('goods_receipts').select('id, goods_receipt_number, branch_id, purchase_order_id, supplier_id, received_at, created_at, note, payment_method, suppliers(name), purchase_orders(purchase_order_number), goods_receipt_items(id, purchase_order_item_id, product_id, product_unit_id, quantity, base_quantity, unit_cost)').eq('branch_id', branchId).order('received_at', { ascending: false }),
    admin.from('goods_receipt_drafts').select('id, draft_number, branch_id, purchase_order_id, supplier_id, received_at, payment_method, note, created_at, updated_at, suppliers(name, code), purchase_orders(purchase_order_number), goods_receipt_draft_items(id, purchase_order_item_id, product_id, product_unit_id, quantity, base_quantity, unit_cost)').eq('branch_id', branchId).order('updated_at', { ascending: false }),
    admin.from('suppliers').select('id, code, name').eq('is_active', true).order('name'),
    admin.from('purchase_orders').select('id, purchase_order_number, supplier_id, status, document_date, grand_total, suppliers(name), purchase_order_items(id, product_id, product_unit_id, quantity_ordered, quantity_received, unit_cost)').eq('branch_id', branchId).in('status', ['submitted', 'approved', 'partially_received']).order('document_date', { ascending: false }),
  ]);
  const error = receiptsResult.error || draftsResult.error || suppliersResult.error || ordersResult.error;
  if (error) throw error;
  const receipts = (receiptsResult.data || []) as unknown as RawReceipt[];
  const drafts = (draftsResult.data || []) as unknown as RawDraft[];
  const productIds = [...new Set([...receipts.flatMap((receipt) => receipt.goods_receipt_items || []).map((item) => item.product_id), ...drafts.flatMap((draft) => draft.goods_receipt_draft_items || []).map((item) => item.product_id)])];
  const unitIds = [...new Set([...receipts.flatMap((receipt) => receipt.goods_receipt_items || []).map((item) => item.product_unit_id), ...drafts.flatMap((draft) => draft.goods_receipt_draft_items || []).map((item) => item.product_unit_id)])];
  const lookups = await loadLookups(admin, productIds, unitIds);
  const receiptRows: HistoryRow[] = receipts.map((receipt) => {
    const items = decorateItems(receipt.goods_receipt_items || [], lookups); const summary = totals(items); const supplier = one(receipt.suppliers); const order = one(receipt.purchase_orders);
    return { id: receipt.id, documentType: 'receipt', documentNumber: receipt.goods_receipt_number, status: 'completed', source: receipt.purchase_order_id ? 'po' : 'direct', branchId: receipt.branch_id, purchaseOrderId: receipt.purchase_order_id, purchaseOrderNumber: order?.purchase_order_number || null, supplierId: receipt.supplier_id || null, supplierName: supplier?.name || null, receivedAt: receipt.received_at, updatedAt: receipt.created_at || receipt.received_at, itemCount: items.length, ...summary, items, note: receipt.note, paymentMethod: receipt.payment_method || null };
  });
  const draftRows: HistoryRow[] = drafts.map((draft) => {
    const items = decorateItems(draft.goods_receipt_draft_items || [], lookups); const summary = totals(items); const supplier = one(draft.suppliers); const order = one(draft.purchase_orders);
    return { id: draft.id, documentType: 'draft', documentNumber: draft.draft_number, status: 'draft', source: draft.purchase_order_id ? 'po' : 'direct', branchId: draft.branch_id, purchaseOrderId: draft.purchase_order_id, purchaseOrderNumber: order?.purchase_order_number || null, supplierId: draft.supplier_id || null, supplierName: supplier?.name || null, receivedAt: draft.received_at, updatedAt: draft.updated_at, itemCount: items.length, ...summary, items, note: draft.note, paymentMethod: draft.payment_method };
  });
  const latestCosts = new Map<string, { product_id: string; product_unit_id: string; unit_cost: number; received_at: string }>();
  for (const row of receiptRows) for (const item of row.items) { const key = `${item.product_id}:${item.product_unit_id}`; if (!latestCosts.has(key)) latestCosts.set(key, { product_id: item.product_id, product_unit_id: item.product_unit_id, unit_cost: numberValue(item.unit_cost), received_at: row.receivedAt }); }
  return { history: [...draftRows, ...receiptRows].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), purchaseOrders: ordersResult.data || [], suppliers: suppliersResult.data || [], latestCosts: [...latestCosts.values()] };
}

function filterHistory(history: HistoryRow[], params: URLSearchParams) {
  const query = normalize(params.get('q')); const from = params.get('from') || ''; const to = params.get('to') || ''; const status = params.get('status') || 'all'; const source = params.get('source') || 'all';
  return history.filter((row) => {
    if (status !== 'all' && row.status !== status) return false;
    if (source !== 'all' && row.source !== source) return false;
    const date = dateOnly(row.status === 'draft' ? row.updatedAt : row.receivedAt);
    if (from && date < from) return false; if (to && date > to) return false;
    if (!query) return true;
    return [row.documentNumber, row.purchaseOrderNumber, row.supplierName, ...row.items.flatMap((item) => [item.product_name, item.sku, item.barcode, item.category_name, item.unit_name])].map(normalize).join(' ').includes(query);
  });
}

export async function GET(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    const params = new URL(request.url).searchParams; const branchId = params.get('branch_id') || context.profile.branch_id;
    if (!branchId || !canAccessCommerceBranch(context.profile, branchId) || !permissionAllowed(context.profile, branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูใบนำเข้าสินค้าของสาขานี้' }, { status: 403 });
    const data = await loadHistory(branchId); const id = params.get('id');
    if (id) {
      const detail = data.history.find((row) => row.id === id && (!params.get('type') || row.documentType === params.get('type')));
      if (!detail) return NextResponse.json({ error: 'ไม่พบรายละเอียดใบนำเข้า' }, { status: 404 });
      return NextResponse.json({ detail });
    }
    const filtered = filterHistory(data.history, params); const pageSize = Math.min(Math.max(Number(params.get('page_size') || 20), 1), 50); const page = Math.max(Number(params.get('page') || 1), 1); const start = (page - 1) * pageSize;
    return NextResponse.json({ history: filtered.slice(start, start + pageSize), pagination: { page, pageSize, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)) }, filters: { q: params.get('q') || '', from: params.get('from') || '', to: params.get('to') || '', status: params.get('status') || 'all', source: params.get('source') || 'all' }, purchaseOrders: data.purchaseOrders, suppliers: data.suppliers, latestCosts: data.latestCosts });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load goods receipts' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    const body = await request.json() as Record<string, unknown>; const branchId = typeof body.branch_id === 'string' && body.branch_id ? body.branch_id : context.profile.branch_id;
    if (!branchId || !canAccessCommerceBranch(context.profile, branchId) || !permissionAllowed(context.profile, branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์รับสินค้าในสาขานี้' }, { status: 403 });
    const admin = requireSupabaseAdmin(); const action = typeof body.action === 'string' ? body.action : 'receive';
    if (action === 'save_draft') {
      if (!Array.isArray(body.items)) return NextResponse.json({ error: 'ต้องมีรายการสินค้า' }, { status: 400 });
      const { data, error } = await admin.rpc('commerce_save_goods_receipt_draft', { p_user_id: context.profile.id, p_draft_id: typeof body.draft_id === 'string' ? body.draft_id : null, p_branch_id: branchId, p_purchase_order_id: typeof body.purchase_order_id === 'string' && body.purchase_order_id ? body.purchase_order_id : null, p_supplier_id: typeof body.supplier_id === 'string' && body.supplier_id ? body.supplier_id : null, p_received_at: typeof body.received_at === 'string' && !Number.isNaN(Date.parse(body.received_at)) ? body.received_at : new Date().toISOString(), p_payment_method: typeof body.payment_method === 'string' ? body.payment_method : 'cash', p_note: typeof body.note === 'string' ? body.note : null, p_items: body.items });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 }); return NextResponse.json({ result: data }, { status: 200 });
    }
    if (action === 'delete_draft' || action === 'finalize_draft') {
      if (typeof body.draft_id !== 'string' || !body.draft_id) return NextResponse.json({ error: 'ไม่พบใบนำเข้าที่พักไว้' }, { status: 400 });
      const functionName = action === 'delete_draft' ? 'commerce_delete_goods_receipt_draft' : 'commerce_finalize_goods_receipt_draft'; const { data, error } = await admin.rpc(functionName, { p_user_id: context.profile.id, p_branch_id: branchId, p_draft_id: body.draft_id });
      if (error) { const status = action === 'finalize_draft' && /จำนวน|ใบสั่งซื้อ|ไม่พร้อม|คงเหลือ|สินค้า|หน่วย/i.test(error.message) ? 409 : 400; return NextResponse.json({ error: error.message }, { status }); }
      return NextResponse.json({ result: data }, { status: action === 'finalize_draft' ? 201 : 200 });
    }
    if (!Array.isArray(body.items) || !body.items.length) return NextResponse.json({ error: 'ต้องมีรายการสินค้าอย่างน้อยหนึ่งรายการ' }, { status: 400 });
    if (typeof body.purchase_order_id !== 'string' || !body.purchase_order_id) {
      if (typeof body.supplier_id !== 'string' || !['cash', 'transfer', 'credit', 'other'].includes(text(body.payment_method))) return NextResponse.json({ error: 'กรอกผู้ขายและวิธีชำระเงิน' }, { status: 400 });
      const receivedAt = typeof body.received_at === 'string' && !Number.isNaN(Date.parse(body.received_at)) ? body.received_at : new Date().toISOString(); const { data, error } = await admin.rpc('commerce_receive_goods_direct', { p_user_id: context.profile.id, p_branch_id: branchId, p_supplier_id: body.supplier_id, p_received_at: receivedAt, p_payment_method: body.payment_method, p_items: body.items, p_note: typeof body.note === 'string' ? body.note : null });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 }); return NextResponse.json({ result: data }, { status: 201 });
    }
    const { data: purchaseOrder, error: orderError } = await admin.from('purchase_orders').select('id, status, branch_id').eq('id', body.purchase_order_id).eq('branch_id', branchId).maybeSingle();
    if (orderError || !purchaseOrder) return NextResponse.json({ error: 'ไม่พบใบสั่งซื้อ' }, { status: 404 });
    if (!['submitted', 'approved', 'partially_received'].includes(purchaseOrder.status)) return NextResponse.json({ error: 'ต้องอนุมัติใบสั่งซื้อก่อนรับสินค้า' }, { status: 409 });
    const { data, error } = await admin.rpc('commerce_receive_purchase_order', { p_user_id: context.profile.id, p_branch_id: branchId, p_purchase_order_id: body.purchase_order_id, p_items: body.items, p_note: typeof body.note === 'string' ? body.note : null });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 }); return NextResponse.json({ result: data }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to process goods receipt' }, { status: 500 }); }
}
