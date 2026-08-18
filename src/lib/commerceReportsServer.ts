import type {
  CommerceReportBranchRow,
  CommerceReportCategoryRow,
  CommerceReportComparison,
  CommerceReportFilters,
  CommerceReportGranularity,
  CommerceReportLowStockRow,
  CommerceReportPaymentRow,
  CommerceReportProductRow,
  CommerceReportRecentSale,
  CommerceReportResponse,
  CommerceReportTrendPoint,
} from '@/lib/commerce';
import { PAYMENT_METHOD_LABELS, toNumber } from '@/lib/commerce';
import {
  canAccessCommerceBranch,
  getCommerceRequestContext,
  hasCommercePermission,
  requireSupabaseAdmin,
  type CommerceProfile,
} from '@/lib/commerceServer';

const REPORT_TIME_ZONE = 'Asia/Bangkok';
const MAX_RANGE_DAYS = 366;
const MAX_TRANSACTION_ROWS = 20_000;
const MAX_DETAIL_ROWS = 20;
const SALE_STATUSES = ['completed', 'partially_returned'];

// Supabase query rows are intentionally dynamic here because this builder reads
// from several legacy and unit-aware reporting tables with different shapes.
// Keep the boundary explicit while avoiding `any` leaking into the rest of app.
type Row = Record<string, unknown>;
type ReportRange = { from: string; to: string; previousFrom: string; previousTo: string };
type Branch = { id: string; name: string };

type PeriodData = {
  sales: Row[];
  saleItems: Row[];
  payments: Row[];
  onlineOrders: Row[];
  onlineItems: Row[];
  expenses: Row[];
  customers: Map<string, string>;
};

type ProductInfo = {
  id: string;
  name: string;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  reorderPoint: number;
  mode: 'shared_base' | 'separate_unit';
  baseUnitCode: string;
};

type UnitInfo = {
  id: string;
  productId: string;
  name: string;
  code: string;
  imageUrl: string | null;
  conversion: number;
  isDefault: boolean;
  canSell: boolean;
  canReceive: boolean;
};

type Catalog = {
  products: Map<string, ProductInfo>;
  units: Map<string, UnitInfo>;
  unitsByProduct: Map<string, UnitInfo[]>;
  categories: Map<string, string>;
};

type StockSnapshot = {
  balances: Row[];
  unitBalances: Row[];
};

type ItemAggregate = {
  productId: string;
  productUnitId: string;
  productName: string;
  unitName: string;
  categoryName: string | null;
  imageUrl: string | null;
  quantity: number;
  sales: number;
  cost: number;
  profit: number;
  costSales: number;
  incomplete: boolean;
};

type Summary = {
  netSales: number;
  grossProfit: number | null;
  grossProfitCoverage: number;
  bills: number;
  averageBill: number;
  paidExpenses: number;
  pendingExpenses: number;
  discounts: number;
};

function bangkokDate(value: string | Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function bangkokToday() {
  return bangkokDate(new Date());
}

function parseCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : parsed;
}

function calendarDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addCalendarDays(value: string, amount: number) {
  const date = parseCalendarDate(value) || new Date(`${bangkokToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return calendarDate(date);
}

function dateDifference(from: string, to: string) {
  const start = parseCalendarDate(from)?.getTime() || 0;
  const end = parseCalendarDate(to)?.getTime() || 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

function periodStart(date: string) {
  return `${date}T00:00:00+07:00`;
}

function periodEndExclusive(date: string) {
  return `${addCalendarDays(date, 1)}T00:00:00+07:00`;
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('th-TH', { timeZone: REPORT_TIME_ZONE, day: 'numeric', month: 'short' }).format(new Date(`${value}T00:00:00Z`));
}

function normalizeRange(params: URLSearchParams): ReportRange {
  const today = bangkokToday();
  const requestedFrom = params.get('from') || '';
  const requestedTo = params.get('to') || '';
  const hasValidCustomRange = Boolean(parseCalendarDate(requestedFrom) && parseCalendarDate(requestedTo) && requestedFrom <= requestedTo);
  const to = hasValidCustomRange ? requestedTo : today;
  const from = hasValidCustomRange ? requestedFrom : addCalendarDays(today, -29);
  const days = dateDifference(from, to);
  if (days > MAX_RANGE_DAYS) throw new Error(`ช่วงรายงานต้องไม่เกิน ${MAX_RANGE_DAYS} วัน`);
  const previousTo = addCalendarDays(from, -1);
  const previousFrom = addCalendarDays(previousTo, -(days - 1));
  return { from, to, previousFrom, previousTo };
}

function granularityForRange(from: string, to: string): CommerceReportGranularity {
  const days = dateDifference(from, to);
  if (days <= 31) return 'day';
  if (days <= 180) return 'week';
  return 'month';
}

function bucketKey(value: string, granularity: CommerceReportGranularity) {
  const day = bangkokDate(value);
  if (granularity === 'day') return day;
  const date = parseCalendarDate(day) || new Date();
  if (granularity === 'month') return `${day.slice(0, 7)}-01`;
  const weekday = date.getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + offset);
  return calendarDate(date);
}

function bucketSequence(from: string, to: string, granularity: CommerceReportGranularity) {
  const first = parseCalendarDate(granularity === 'day' ? from : bucketKey(`${from}T00:00:00Z`, granularity)) || new Date();
  const result: string[] = [];
  const guard = granularity === 'day' ? 1 : granularity === 'week' ? 7 : 0;
  const cursor = new Date(first);
  while (calendarDate(cursor) <= to && result.length < 400) {
    result.push(calendarDate(cursor));
    if (granularity === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (granularity === 'week') cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    if (guard === 0 && cursor.getUTCFullYear() > 2100) break;
  }
  return result;
}

function rowAmount(row: Row | null | undefined, key: string) {
  return toNumber(row?.[key]);
}

function costIsComplete(item: Row) {
  return rowAmount(item, 'unit_cost_snapshot') > 0 || rowAmount(item, 'line_total') === 0;
}

function paymentLabel(method: string) {
  if (method in PAYMENT_METHOD_LABELS) return PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS];
  if (method === 'bank_transfer') return 'โอนผ่านธนาคาร';
  if (method === 'cash_on_pickup') return 'เงินสดตอนรับสินค้า';
  if (method === 'online') return 'ออนไลน์';
  return method || 'ไม่ระบุ';
}

function percentageChange(value: number | null, previous: number | null): CommerceReportComparison {
  if (value === null || previous === null) return { value, previous, changePercent: null };
  if (previous === 0) return { value, previous, changePercent: value === 0 ? 0 : null };
  return { value, previous, changePercent: ((value - previous) / Math.abs(previous)) * 100 };
}

async function loadBranches(profile: CommerceProfile, requestedBranchId: string | null) {
  const admin = requireSupabaseAdmin();
  const { data, error } = await admin.from('branches').select('id,name').eq('is_active', true).order('name').limit(200);
  if (error) throw error;
  const accessible = (data || []).filter((branch: Branch) => canAccessCommerceBranch(profile, branch.id) && hasCommercePermission(profile, 'reports.view', branch.id));
  if (requestedBranchId && requestedBranchId !== 'all' && !accessible.some((branch: Branch) => branch.id === requestedBranchId)) throw new Error('ไม่มีสิทธิ์ดูรายงานสาขานี้');
  if (!accessible.length) throw new Error('ไม่มีสิทธิ์ดูรายงาน');
  if (requestedBranchId && requestedBranchId !== 'all') return { branches: accessible.filter((branch: Branch) => branch.id === requestedBranchId), scope: requestedBranchId };
  return { branches: accessible, scope: 'all' as const };
}

async function loadCatalog() {
  const admin = requireSupabaseAdmin();
  const [productsResult, unitsResult, categoriesResult] = await Promise.all([
    admin.from('products').select('id,name,image_url,category_id,reorder_point,unit_inventory_mode,base_unit_code').eq('is_active', true).limit(50_000),
    admin.from('product_units').select('id,product_id,name,code,image_url,conversion_to_base,is_default,can_sell,can_receive').limit(100_000),
    admin.from('product_categories').select('id,name').eq('is_active', true).limit(5_000),
  ]);
  const firstError = [productsResult.error, unitsResult.error, categoriesResult.error].find(Boolean);
  if (firstError) throw firstError;
  const categories = new Map<string, string>((categoriesResult.data || []).map((row: Row) => [String(row.id), String(row.name)]));
  const products = new Map<string, ProductInfo>();
  (productsResult.data || []).forEach((row: Row) => products.set(String(row.id), {
    id: String(row.id),
    name: String(row.name),
    imageUrl: row.image_url ? String(row.image_url) : null,
    categoryId: row.category_id ? String(row.category_id) : null,
    categoryName: row.category_id ? categories.get(String(row.category_id)) || null : null,
    reorderPoint: rowAmount(row, 'reorder_point'),
    mode: row.unit_inventory_mode === 'separate_unit' ? 'separate_unit' : 'shared_base',
    baseUnitCode: String(row.base_unit_code || ''),
  }));
  const units = new Map<string, UnitInfo>();
  const unitsByProduct = new Map<string, UnitInfo[]>();
  (unitsResult.data || []).forEach((row: Row) => {
    const unit: UnitInfo = {
      id: String(row.id),
      productId: String(row.product_id),
      name: String(row.name),
      code: String(row.code),
      imageUrl: row.image_url ? String(row.image_url) : null,
      conversion: Math.max(0.001, rowAmount(row, 'conversion_to_base')),
      isDefault: Boolean(row.is_default),
      canSell: row.can_sell !== false,
      canReceive: row.can_receive !== false,
    };
    units.set(unit.id, unit);
    const list = unitsByProduct.get(unit.productId) || [];
    list.push(unit);
    unitsByProduct.set(unit.productId, list);
  });
  return { products, units, unitsByProduct, categories } satisfies Catalog;
}

async function loadPeriod(branchIds: string[], range: { from: string; to: string }): Promise<PeriodData> {
  const admin = requireSupabaseAdmin();
  const [salesResult, onlineResult, expensesResult] = await Promise.all([
    admin.from('sales').select('id,receipt_number,branch_id,customer_id,source_channel,status,discount_total,grand_total,completed_at').in('branch_id', branchIds).in('status', SALE_STATUSES).gte('completed_at', periodStart(range.from)).lt('completed_at', periodEndExclusive(range.to)).order('completed_at', { ascending: false }).limit(MAX_TRANSACTION_ROWS),
    admin.from('online_orders').select('id,order_number,branch_id,customer_id,customer_name,status,discount_total,grand_total,payment_method,placed_at').in('branch_id', branchIds).eq('status', 'completed').gte('placed_at', periodStart(range.from)).lt('placed_at', periodEndExclusive(range.to)).order('placed_at', { ascending: false }).limit(MAX_TRANSACTION_ROWS),
    admin.from('expenses').select('amount,status,expense_date,branch_id,category').in('branch_id', branchIds).gte('expense_date', range.from).lte('expense_date', range.to).limit(MAX_TRANSACTION_ROWS),
  ]);
  const firstError = [salesResult.error, onlineResult.error, expensesResult.error].find(Boolean);
  if (firstError) throw firstError;
  const sales = salesResult.data || [];
  const onlineOrders = onlineResult.data || [];
  const saleIds = sales.map((row: Row) => String(row.id));
  const onlineIds = onlineOrders.map((row: Row) => String(row.id));
  const [itemsResult, paymentsResult, onlineItemsResult] = await Promise.all([
    saleIds.length ? admin.from('sale_items').select('sale_id,product_id,product_unit_id,product_name_snapshot,unit_name_snapshot,quantity,line_total,unit_cost_snapshot').in('sale_id', saleIds).limit(MAX_TRANSACTION_ROWS * 10) : Promise.resolve({ data: [], error: null }),
    saleIds.length ? admin.from('payments').select('sale_id,method,amount').in('sale_id', saleIds).limit(MAX_TRANSACTION_ROWS * 4) : Promise.resolve({ data: [], error: null }),
    onlineIds.length ? admin.from('online_order_items').select('online_order_id,product_id,product_unit_id,product_name_snapshot,unit_name_snapshot,quantity,line_total').in('online_order_id', onlineIds).limit(MAX_TRANSACTION_ROWS * 10) : Promise.resolve({ data: [], error: null }),
  ]);
  const detailError = [itemsResult.error, paymentsResult.error, onlineItemsResult.error].find(Boolean);
  if (detailError) throw detailError;
  const customerIds = [...new Set([...sales, ...onlineOrders].map((row: Row) => row.customer_id).filter(Boolean).map(String))];
  const customersResult = customerIds.length ? await admin.from('customers').select('id,full_name').in('id', customerIds) : { data: [], error: null };
  if (customersResult.error) throw customersResult.error;
  return {
    sales,
    saleItems: itemsResult.data || [],
    payments: paymentsResult.data || [],
    onlineOrders,
    onlineItems: onlineItemsResult.data || [],
    expenses: expensesResult.data || [],
    customers: new Map((customersResult.data || []).map((row: Row) => [String(row.id), String(row.full_name)])),
  };
}

async function loadStock(branchIds: string[]): Promise<StockSnapshot> {
  const admin = requireSupabaseAdmin();
  const [balancesResult, unitBalancesResult] = await Promise.all([
    admin.from('stock_balances').select('branch_id,product_id,on_hand,reserved,damaged').in('branch_id', branchIds).limit(50_000),
    admin.from('stock_unit_balances').select('branch_id,product_id,product_unit_id,on_hand,reserved,damaged').in('branch_id', branchIds).limit(100_000),
  ]);
  const firstError = [balancesResult.error, unitBalancesResult.error].find(Boolean);
  if (firstError) throw firstError;
  return { balances: balancesResult.data || [], unitBalances: unitBalancesResult.data || [] };
}

function summarizePeriod(period: PeriodData): Summary {
  const posSales = period.sales.reduce((sum, row) => sum + rowAmount(row, 'grand_total'), 0);
  const onlineSales = period.onlineOrders.reduce((sum, row) => sum + rowAmount(row, 'grand_total'), 0);
  const bills = period.sales.length + period.onlineOrders.length;
  const allItems = period.saleItems;
  const totalItemSales = [...period.saleItems, ...period.onlineItems].reduce((sum, row) => sum + rowAmount(row, 'line_total'), 0);
  const completeItemSales = allItems.filter(costIsComplete).reduce((sum, row) => sum + rowAmount(row, 'line_total'), 0);
  const grossProfit = allItems.filter(costIsComplete).reduce((sum, row) => sum + rowAmount(row, 'line_total') - (rowAmount(row, 'quantity') * rowAmount(row, 'unit_cost_snapshot')), 0);
  const expenses = period.expenses;
  return {
    netSales: posSales + onlineSales,
    grossProfit: completeItemSales > 0 ? grossProfit : null,
    grossProfitCoverage: totalItemSales > 0 ? completeItemSales / totalItemSales : 0,
    bills,
    averageBill: bills ? (posSales + onlineSales) / bills : 0,
    paidExpenses: expenses.filter((row) => row.status === 'paid').reduce((sum, row) => sum + rowAmount(row, 'amount'), 0),
    pendingExpenses: expenses.filter((row) => row.status === 'pending' || row.status === 'approved').reduce((sum, row) => sum + rowAmount(row, 'amount'), 0),
    discounts: [...period.sales, ...period.onlineOrders].reduce((sum, row) => sum + rowAmount(row, 'discount_total'), 0),
  };
}

function buildTrend(period: PeriodData, range: ReportRange, granularity: CommerceReportGranularity): CommerceReportTrendPoint[] {
  const points = new Map<string, CommerceReportTrendPoint>();
  bucketSequence(range.from, range.to, granularity).forEach((periodKey) => points.set(periodKey, { period: periodKey, label: granularity === 'day' ? dateTimeLabel(periodKey) : granularity === 'week' ? `สัปดาห์ ${dateTimeLabel(periodKey)}` : new Intl.DateTimeFormat('th-TH', { month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(`${periodKey}T00:00:00Z`)), sales: 0, profit: null, profitCoverage: 0, transactions: 0, expenses: 0 }));
  const profitByBucket = new Map<string, { profit: number; completeSales: number; totalSales: number }>();
  const addSale = (row: Row, timestamp: string) => {
    const key = bucketKey(timestamp, granularity);
    const point = points.get(key) || { period: key, label: dateTimeLabel(key), sales: 0, profit: null, profitCoverage: 0, transactions: 0, expenses: 0 };
    point.sales += rowAmount(row, 'grand_total');
    point.transactions += 1;
    points.set(key, point);
  };
  period.sales.forEach((row) => addSale(row, String(row.completed_at)));
  period.onlineOrders.forEach((row) => addSale(row, String(row.placed_at)));
  period.expenses.forEach((row) => {
    if (row.status !== 'paid') return;
    const key = bucketKey(`${row.expense_date}T00:00:00+07:00`, granularity);
    const point = points.get(key);
    if (point) point.expenses += rowAmount(row, 'amount');
  });
  const saleTimeById = new Map(period.sales.map((row) => [String(row.id), String(row.completed_at)]));
  period.saleItems.forEach((row) => {
    const timestamp = saleTimeById.get(String(row.sale_id));
    if (!timestamp) return;
    const key = bucketKey(timestamp, granularity);
    const current = profitByBucket.get(key) || { profit: 0, completeSales: 0, totalSales: 0 };
    const lineTotal = rowAmount(row, 'line_total');
    current.totalSales += lineTotal;
    if (costIsComplete(row)) {
      current.completeSales += lineTotal;
      current.profit += lineTotal - rowAmount(row, 'quantity') * rowAmount(row, 'unit_cost_snapshot');
    }
    profitByBucket.set(key, current);
  });
  points.forEach((point, key) => {
    const profit = profitByBucket.get(key);
    if (profit && profit.completeSales > 0) {
      point.profit = profit.profit;
      point.profitCoverage = profit.totalSales ? profit.completeSales / profit.totalSales : 0;
    }
  });
  return [...points.values()];
}

function buildProductRows(period: PeriodData, catalog: Catalog, branchName?: string) {
  const byKey = new Map<string, ItemAggregate>();
  const add = (row: Row, online = false) => {
    const productId = String(row.product_id);
    const productUnitId = String(row.product_unit_id);
    const key = `${productId}:${productUnitId}`;
    const product = catalog.products.get(productId);
    const unit = catalog.units.get(productUnitId);
    const current = byKey.get(key) || {
      productId,
      productUnitId,
      productName: String(row.product_name_snapshot || product?.name || 'สินค้าไม่ระบุชื่อ'),
      unitName: String(row.unit_name_snapshot || unit?.name || 'หน่วย'),
      categoryName: product?.categoryName || null,
      imageUrl: unit?.imageUrl || product?.imageUrl || null,
      quantity: 0,
      sales: 0,
      cost: 0,
      profit: 0,
      costSales: 0,
      incomplete: online,
    };
    const lineTotal = rowAmount(row, 'line_total');
    const quantity = rowAmount(row, 'quantity');
    current.quantity += quantity;
    current.sales += lineTotal;
    if (!online && costIsComplete(row)) {
      current.cost += quantity * rowAmount(row, 'unit_cost_snapshot');
      current.profit += lineTotal - quantity * rowAmount(row, 'unit_cost_snapshot');
      current.costSales += lineTotal;
    } else {
      current.incomplete = true;
    }
    byKey.set(key, current);
  };
  period.saleItems.forEach((row) => add(row));
  period.onlineItems.forEach((row) => add(row, true));
  return [...byKey.values()].map((row): CommerceReportProductRow => ({
    productId: row.productId,
    productUnitId: row.productUnitId,
    productName: row.productName,
    unitName: row.unitName,
    categoryName: row.categoryName,
    imageUrl: row.imageUrl,
    quantity: row.quantity,
    sales: row.sales,
    cost: row.incomplete ? null : row.cost,
    profit: row.incomplete ? null : row.profit,
    margin: row.incomplete || row.sales <= 0 ? null : row.profit / row.sales,
    costComplete: !row.incomplete,
    ...(branchName ? { branchName } : {}),
  })).sort((a, b) => b.sales - a.sales);
}

function buildPaymentMix(period: PeriodData): CommerceReportPaymentRow[] {
  const mix = new Map<string, CommerceReportPaymentRow>();
  period.payments.forEach((row) => {
    const method = String(row.method);
    const current = mix.get(method) || { method, label: paymentLabel(method), amount: 0, count: 0 };
    current.amount += rowAmount(row, 'amount');
    current.count += 1;
    mix.set(method, current);
  });
  period.onlineOrders.forEach((row) => {
    const method = String(row.payment_method || 'online');
    const current = mix.get(method) || { method, label: paymentLabel(method), amount: 0, count: 0 };
    current.amount += rowAmount(row, 'grand_total');
    current.count += 1;
    mix.set(method, current);
  });
  return [...mix.values()].sort((a, b) => b.amount - a.amount);
}

function buildCategoryPerformance(rows: CommerceReportProductRow[]): CommerceReportCategoryRow[] {
  const categories = new Map<string, CommerceReportCategoryRow>();
  rows.forEach((row) => {
    const categoryId = row.categoryName || null;
    const key = categoryId || 'uncategorized';
    const current = categories.get(key) || { categoryId: null, categoryName: row.categoryName || 'ไม่ระบุหมวดหมู่', sales: 0, profit: 0, transactions: 0 };
    current.sales += row.sales;
    current.transactions += 1;
    if (row.profit === null) current.profit = null;
    else if (current.profit !== null) current.profit += row.profit;
    categories.set(key, current);
  });
  return [...categories.values()].sort((a, b) => b.sales - a.sales);
}

function buildLowStock(stock: StockSnapshot, catalog: Catalog, branches: Branch[], includeAllBranches: boolean) {
  const balances = new Map(stock.balances.map((row) => [`${row.branch_id}:${row.product_id}`, row]));
  const unitBalances = new Map(stock.unitBalances.map((row) => [`${row.branch_id}:${row.product_unit_id}`, row]));
  const result: CommerceReportLowStockRow[] = [];
  branches.forEach((branch) => {
    catalog.products.forEach((product) => {
      const units = catalog.unitsByProduct.get(product.id) || [];
      if (product.mode === 'separate_unit') {
        units.filter((unit) => unit.canSell).forEach((unit) => {
          const balance = unitBalances.get(`${branch.id}:${unit.id}`);
          const available = Math.max(0, rowAmount(balance, 'on_hand') - rowAmount(balance, 'reserved') - rowAmount(balance, 'damaged'));
          const reorderPoint = product.reorderPoint / unit.conversion;
          if (!balance && reorderPoint <= 0) return;
          if (available > 0 && available > reorderPoint) return;
          result.push({ productId: product.id, productUnitId: unit.id, productName: product.name, unitName: unit.name, imageUrl: unit.imageUrl || product.imageUrl, available, reserved: rowAmount(balance, 'reserved'), reorderPoint, status: available <= 0 ? 'out' : 'low', ...(includeAllBranches ? { branchName: branch.name } : {}) });
        });
        return;
      }
      const balance = balances.get(`${branch.id}:${product.id}`);
      const available = Math.max(0, rowAmount(balance, 'on_hand') - rowAmount(balance, 'reserved') - rowAmount(balance, 'damaged'));
      if (!balance && product.reorderPoint <= 0) return;
      if (available > 0 && available > product.reorderPoint) return;
      const unit = units.find((candidate) => candidate.isDefault) || units[0];
      result.push({ productId: product.id, productUnitId: unit?.id || null, productName: product.name, unitName: unit?.name || product.baseUnitCode, imageUrl: unit?.imageUrl || product.imageUrl, available, reserved: rowAmount(balance, 'reserved'), reorderPoint: product.reorderPoint, status: available <= 0 ? 'out' : 'low', ...(includeAllBranches ? { branchName: branch.name } : {}) });
    });
  });
  return result.sort((a, b) => Number(a.status !== 'out') - Number(b.status !== 'out') || a.available - b.available).slice(0, 24);
}

function buildRecentSales(period: PeriodData, branchNames: Map<string, string>): CommerceReportRecentSale[] {
  const itemsBySale = new Map<string, Row[]>();
  period.saleItems.forEach((item) => { const list = itemsBySale.get(String(item.sale_id)) || []; list.push(item); itemsBySale.set(String(item.sale_id), list); });
  const itemsByOrder = new Map<string, Row[]>();
  period.onlineItems.forEach((item) => { const list = itemsByOrder.get(String(item.online_order_id)) || []; list.push(item); itemsByOrder.set(String(item.online_order_id), list); });
  const paymentsBySale = new Map<string, string[]>();
  period.payments.forEach((payment) => { const list = paymentsBySale.get(String(payment.sale_id)) || []; if (!list.includes(String(payment.method))) list.push(String(payment.method)); paymentsBySale.set(String(payment.sale_id), list); });
  const saleRows: CommerceReportRecentSale[] = period.sales.map((sale) => ({ id: String(sale.id), documentNumber: String(sale.receipt_number), channel: 'POS', status: String(sale.status), completedAt: String(sale.completed_at), customerName: sale.customer_id ? period.customers.get(String(sale.customer_id)) || null : null, total: rowAmount(sale, 'grand_total'), paymentMethods: (paymentsBySale.get(String(sale.id)) || []).map(paymentLabel), items: (itemsBySale.get(String(sale.id)) || []).slice(0, 8).map((item) => ({ productName: String(item.product_name_snapshot), unitName: String(item.unit_name_snapshot), quantity: rowAmount(item, 'quantity'), lineTotal: rowAmount(item, 'line_total') })), branchName: branchNames.get(String(sale.branch_id)) }));
  const onlineRows: CommerceReportRecentSale[] = period.onlineOrders.map((order) => ({ id: String(order.id), documentNumber: String(order.order_number), channel: 'ออนไลน์', status: String(order.status), completedAt: String(order.placed_at), customerName: String(order.customer_name || '') || null, total: rowAmount(order, 'grand_total'), paymentMethods: [paymentLabel(String(order.payment_method || 'online'))], items: (itemsByOrder.get(String(order.id)) || []).slice(0, 8).map((item) => ({ productName: String(item.product_name_snapshot), unitName: String(item.unit_name_snapshot), quantity: rowAmount(item, 'quantity'), lineTotal: rowAmount(item, 'line_total') })), branchName: branchNames.get(String(order.branch_id)) }));
  return [...saleRows, ...onlineRows].sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, MAX_DETAIL_ROWS);
}

function branchSummary(branch: Branch, period: PeriodData, stockRiskCount: number, catalog: Catalog): CommerceReportBranchRow {
  const summary = summarizePeriod(period);
  const products = buildProductRows(period, catalog);
  const hasIncomplete = products.some((row) => !row.costComplete);
  return { branchId: branch.id, branchName: branch.name, sales: summary.netSales, profit: hasIncomplete ? null : summary.grossProfit, transactions: summary.bills, stockRiskCount };
}

export async function buildCommerceReport(request: Request): Promise<{ report: CommerceReportResponse; profile: CommerceProfile; branches: Branch[] }> {
  const context = await getCommerceRequestContext(request);
  if (!context) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  const params = new URL(request.url).searchParams;
  const range = normalizeRange(params);
  const requestedBranchId = params.get('branch_id') || context.profile.commercePreferences?.lastBranchId || context.profile.branch_id;
  const branchScope = await loadBranches(context.profile, requestedBranchId);
  const branches = branchScope.branches as Branch[];
  const branchIds = branches.map((branch) => branch.id);
  const catalog = await loadCatalog();
  const [period, previousPeriod, stock] = await Promise.all([
    loadPeriod(branchIds, range),
    loadPeriod(branchIds, { from: range.previousFrom, to: range.previousTo }),
    loadStock(branchIds),
  ]);
  const summary = summarizePeriod(period);
  const previousSummary = summarizePeriod(previousPeriod);
  const lowStock = buildLowStock(stock, catalog, branches, branchScope.scope === 'all');
  const topProducts = buildProductRows(period, catalog);
  const trend = buildTrend(period, range, granularityForRange(range.from, range.to));
  const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
  const branchComparison = branchScope.scope === 'all' ? branches.map((branch) => {
    const branchPeriod = { ...period, sales: period.sales.filter((row) => row.branch_id === branch.id), onlineOrders: period.onlineOrders.filter((row) => row.branch_id === branch.id), expenses: period.expenses.filter((row) => row.branch_id === branch.id) };
    const branchStock = buildLowStock(stock, catalog, [branch], false).length;
    return branchSummary(branch, branchPeriod, branchStock, catalog);
  }).sort((a, b) => b.sales - a.sales) : [];
  const comparison = {
    netSales: percentageChange(summary.netSales, previousSummary.netSales),
    grossProfit: percentageChange(summary.grossProfit, previousSummary.grossProfit),
    bills: percentageChange(summary.bills, previousSummary.bills),
    averageBill: percentageChange(summary.averageBill, previousSummary.averageBill),
    stockRiskCount: { value: lowStock.length, previous: null, changePercent: null },
  };
  const filters: CommerceReportFilters = { branchId: branchScope.scope, from: range.from, to: range.to, previousFrom: range.previousFrom, previousTo: range.previousTo, granularity: granularityForRange(range.from, range.to) };
  return {
    profile: context.profile,
    branches,
    report: {
      filters,
      kpis: { ...summary, stockRiskCount: lowStock.length },
      comparison,
      trend,
      topProducts: topProducts.slice(0, 20),
      lowStock,
      paymentMix: buildPaymentMix(period),
      categoryPerformance: buildCategoryPerformance(topProducts),
      branchComparison,
      recentSales: buildRecentSales(period, branchNames),
      meta: { updatedAt: new Date().toISOString(), costCoverage: summary.grossProfitCoverage, totalProducts: catalog.products.size, hasOnlineCostGap: period.onlineOrders.length > 0 },
    },
  };
}

export function reportExportRows(report: CommerceReportResponse) {
  return {
    summary: [{
      ช่วงเวลา: `${report.filters.from} - ${report.filters.to}`,
      ยอดขายสุทธิ: report.kpis.netSales,
      กำไรขั้นต้น: report.kpis.grossProfit ?? 'ต้นทุนยังไม่ครบ',
      ครอบคลุมต้นทุน: report.kpis.grossProfitCoverage,
      จำนวนบิล: report.kpis.bills,
      ยอดเฉลี่ยต่อบิล: report.kpis.averageBill,
      สินค้าต้องติดตามสต๊อก: report.kpis.stockRiskCount,
      ค่าใช้จ่ายจ่ายแล้ว: report.kpis.paidExpenses,
    }],
    trend: report.trend.map((row) => ({ ช่วงเวลา: row.period, ป้ายกำกับ: row.label, ยอดขาย: row.sales, กำไร: row.profit ?? 'ต้นทุนยังไม่ครบ', จำนวนบิล: row.transactions, ค่าใช้จ่าย: row.expenses })),
    products: report.topProducts.map((row) => ({ สินค้า: row.productName, หน่วย: row.unitName, หมวดหมู่: row.categoryName || '-', จำนวนขาย: row.quantity, ยอดขาย: row.sales, ต้นทุน: row.cost ?? 'ต้นทุนยังไม่ครบ', กำไร: row.profit ?? 'ต้นทุนยังไม่ครบ', สาขา: row.branchName || '-' })),
    stock: report.lowStock.map((row) => ({ สินค้า: row.productName, หน่วย: row.unitName, คงเหลือ: row.available, จอง: row.reserved, จุดติดตาม: row.reorderPoint, สถานะ: row.status === 'out' ? 'หมด' : 'ใกล้หมด', สาขา: row.branchName || '-' })),
    payments: report.paymentMix.map((row) => ({ วิธีชำระเงิน: row.label, ยอดรวม: row.amount, จำนวนรายการ: row.count })),
    sales: report.recentSales.flatMap((sale) => sale.items.length ? sale.items.map((item) => ({ เลขที่บิล: sale.documentNumber, ช่องทาง: sale.channel, เวลา: sale.completedAt, ลูกค้า: sale.customerName || '-', สินค้า: item.productName, หน่วย: item.unitName, จำนวน: item.quantity, ยอดรายการ: item.lineTotal, ยอดบิล: sale.total })) : [{ เลขที่บิล: sale.documentNumber, ช่องทาง: sale.channel, เวลา: sale.completedAt, ลูกค้า: sale.customerName || '-', สินค้า: '-', หน่วย: '-', จำนวน: 0, ยอดรายการ: 0, ยอดบิล: sale.total }]),
  };
}
