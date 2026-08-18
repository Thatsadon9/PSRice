export type CommercePaymentMethod = 'cash' | 'qr' | 'transfer' | 'welfare' | 'card' | 'credit';

export interface CommerceBranch {
  id: string;
  name: string;
}

export interface CommerceCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface CommerceUnit {
  id: string;
  code: string;
  name: string;
  barcode: string | null;
  imageUrl: string | null;
  conversionToBase: number;
  isDefault: boolean;
  canSell: boolean;
  canReceive: boolean;
  available: number;
  onHand: number;
  reserved: number;
  damaged: number;
  salePrice: number;
  priceReason: string;
  costPrice?: number;
  reorderPoint?: number;
}

export interface CommerceProduct {
  id: string;
  sku: string;
  barcode: string | null;
  barcodes: string[];
  name: string;
  brand: string | null;
  imageUrl: string | null;
  categoryName: string | null;
  defaultSalePrice: number;
  defaultCostPrice: number;
  priceReason: string;
  available: number;
  onHand: number;
  reserved: number;
  damaged: number;
  inTransit: number;
  baseUnitCode: string;
  unitInventoryMode: 'shared_base' | 'separate_unit';
  units: CommerceUnit[];
}

export interface CommerceRegisterSession {
  id: string;
  registerName: string;
  openingFloat: number;
  expectedCash: number;
  openedAt: string;
}

export const COMMERCE_PAYMENT_METHODS: CommercePaymentMethod[] = ['cash', 'qr', 'transfer', 'card', 'welfare', 'credit'];

export interface PosBranchSettings {
  promptpayEnabled: boolean;
  promptpayDisplayName: string | null;
  defaultRegisterName: string;
  requireOpenRegister: boolean;
  showOutOfStock: boolean;
  enabledPaymentMethods: CommercePaymentMethod[];
  receiptFooter: string | null;
}

export const DEFAULT_POS_BRANCH_SETTINGS: PosBranchSettings = {
  promptpayEnabled: false,
  promptpayDisplayName: null,
  defaultRegisterName: 'Counter 1',
  requireOpenRegister: true,
  showOutOfStock: false,
  enabledPaymentMethods: COMMERCE_PAYMENT_METHODS,
  receiptFooter: null,
};

export interface CommerceBootstrap {
  branches: CommerceBranch[];
  categories: CommerceCategory[];
  branchId: string;
  products: CommerceProduct[];
  registerSession: CommerceRegisterSession | null;
  posSettings: PosBranchSettings;
}

export type CommerceReportGranularity = 'day' | 'week' | 'month';
export type CommerceReportMetric = 'sales' | 'profit' | 'transactions' | 'expenses';

export interface CommerceReportFilters {
  branchId: string | 'all';
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  granularity: CommerceReportGranularity;
}

export interface CommerceReportComparison {
  value: number | null;
  previous: number | null;
  changePercent: number | null;
}

export interface CommerceReportKpis {
  netSales: number;
  grossProfit: number | null;
  grossProfitCoverage: number;
  bills: number;
  averageBill: number;
  stockRiskCount: number;
  paidExpenses: number;
  pendingExpenses: number;
  discounts: number;
}

export interface CommerceReportTrendPoint {
  period: string;
  label: string;
  sales: number;
  profit: number | null;
  profitCoverage: number;
  transactions: number;
  expenses: number;
}

export interface CommerceReportProductRow {
  productId: string;
  productUnitId: string;
  productName: string;
  unitName: string;
  categoryName: string | null;
  imageUrl: string | null;
  quantity: number;
  sales: number;
  cost: number | null;
  profit: number | null;
  margin: number | null;
  costComplete: boolean;
  branchName?: string;
}

export interface CommerceReportLowStockRow {
  productId: string;
  productUnitId: string | null;
  productName: string;
  unitName: string;
  imageUrl: string | null;
  available: number;
  reserved: number;
  reorderPoint: number;
  status: 'out' | 'low';
  branchName?: string;
}

export interface CommerceReportPaymentRow {
  method: string;
  label: string;
  amount: number;
  count: number;
}

export interface CommerceReportCategoryRow {
  categoryId: string | null;
  categoryName: string;
  sales: number;
  profit: number | null;
  transactions: number;
}

export interface CommerceReportBranchRow {
  branchId: string;
  branchName: string;
  sales: number;
  profit: number | null;
  transactions: number;
  stockRiskCount: number;
}

export interface CommerceReportSaleItem {
  productName: string;
  unitName: string;
  quantity: number;
  lineTotal: number;
}

export interface CommerceReportRecentSale {
  id: string;
  documentNumber: string;
  channel: string;
  status: string;
  completedAt: string;
  customerName: string | null;
  total: number;
  paymentMethods: string[];
  items: CommerceReportSaleItem[];
  branchName?: string;
}

export interface CommerceReportResponse {
  filters: CommerceReportFilters;
  kpis: CommerceReportKpis;
  comparison: {
    netSales: CommerceReportComparison;
    grossProfit: CommerceReportComparison;
    bills: CommerceReportComparison;
    averageBill: CommerceReportComparison;
    stockRiskCount: CommerceReportComparison;
  };
  trend: CommerceReportTrendPoint[];
  topProducts: CommerceReportProductRow[];
  lowStock: CommerceReportLowStockRow[];
  paymentMix: CommerceReportPaymentRow[];
  categoryPerformance: CommerceReportCategoryRow[];
  branchComparison: CommerceReportBranchRow[];
  recentSales: CommerceReportRecentSale[];
  meta: {
    updatedAt: string;
    costCoverage: number;
    totalProducts: number;
    hasOnlineCostGap: boolean;
  };
}

export interface PosCartLine {
  key: string;
  productId: string;
  productUnitId: string;
  productName: string;
  unitName: string;
  quantity: number;
  unitPrice: number;
  priceReason: string;
  conversionToBase: number;
  available: number;
  discountAmount: number;
}

export interface PosPaymentLine {
  method: CommercePaymentMethod;
  amount: number;
  reference?: string;
}

export const PAYMENT_METHOD_LABELS: Record<CommercePaymentMethod, string> = {
  cash: 'เงินสด',
  qr: 'QR รับเงิน',
  transfer: 'โอนเงิน',
  welfare: 'สวัสดิการ',
  card: 'บัตร',
  credit: 'เครดิตลูกค้า',
};

export function formatBaht(value: number) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(value);
}

export function toNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
