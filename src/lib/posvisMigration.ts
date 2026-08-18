import * as XLSX from '@e965/xlsx';

export const POSVIS_DATA_TYPES = ['branches', 'products', 'posvis_products', 'customers', 'suppliers', 'stock', 'legacy_sales'] as const;
export type PosvisDataType = typeof POSVIS_DATA_TYPES[number];

export type PosvisRawProductRow = {
  product_barcode: string;
  product_name: string;
  category_desc: string;
  unit_desc: string;
  stock: string | number;
  cost_price_per_unit: string | number;
  price: string | number;
  point_of_order_qty: string | number;
  stock_status: string;
};

export type PosvisValidationWarning = { code: string; message: string; rowNumbers: number[] };

export type PosvisNormalizedUnitRow = {
  rowNumber: number;
  externalRef: string;
  barcode: string | null;
  productName: string;
  categoryName: string;
  groupKey: string;
  sku: string;
  unitCode: string;
  unitName: string;
  conversionToBase: number;
  stock: number;
  costPrice: number;
  salePrice: number;
  reorderPoint: number;
  canSell: boolean;
  canReceive: boolean;
  statusLabel: string;
  warningCodes: string[];
};

export type PosvisGroupedProductPreview = {
  groupKey: string;
  sku: string;
  name: string;
  categoryName: string;
  unitInventoryMode: 'separate_unit';
  units: PosvisNormalizedUnitRow[];
};

export type PosvisProductPreview = {
  products: PosvisGroupedProductPreview[];
  unitCount: number;
  stockTotal: number;
  warningCount: number;
  warnings: PosvisValidationWarning[];
};

export type MigrationValidationRow = {
  rowNumber: number;
  externalRef: string | null;
  rawData: Record<string, unknown>;
  normalizedData: Record<string, unknown>;
  status: 'valid' | 'warning' | 'error';
  errorCodes: string[];
  errorMessage: string | null;
};

const POSVIS_PRODUCT_HEADERS = ['product_barcode', 'product_name', 'category_desc', 'unit_desc', 'stock', 'cost_price_per_unit', 'price', 'point_of_order_qty', 'stock_status'] as const;

const aliases: Record<string, string[]> = {
  external_ref: ['externalref', 'posvisid', 'id', 'รหัสเดิม', 'รหัสposvis'],
  code: ['code', 'รหัส', 'รหัสสาขา', 'รหัสผู้ขาย'],
  branch_code: ['branchcode', 'สาขา', 'รหัสสาขา'],
  sku: ['sku', 'รหัสสินค้า', 'productcode'],
  barcode: ['barcode', 'บาร์โค้ด', 'รหัสบาร์โค้ด'],
  name: ['name', 'ชื่อ', 'ชื่อสินค้า', 'ชื่อสาขา', 'ชื่อผู้ขาย'],
  category: ['category', 'หมวด', 'หมวดหมู่'],
  unit: ['unit', 'หน่วย', 'หน่วยสินค้า'],
  conversion: ['conversion', 'อัตราแปลง', 'จำนวนหน่วยฐาน'],
  price: ['price', 'ราคาขาย', 'ราคา'],
  cost: ['cost', 'ต้นทุน', 'ราคาทุน'],
  quantity: ['quantity', 'qty', 'stock', 'จำนวน', 'คงเหลือ'],
  phone: ['phone', 'tel', 'โทรศัพท์', 'เบอร์โทร'],
  email: ['email', 'อีเมล'],
  member_code: ['membercode', 'รหัสสมาชิก'],
  tax_id: ['taxid', 'เลขผู้เสียภาษี'],
  document_number: ['documentnumber', 'receipt', 'เลขที่เอกสาร', 'เลขที่บิล'],
  transaction_at: ['transactionat', 'date', 'วันที่', 'วันที่ขาย'],
  subtotal: ['subtotal', 'ยอดก่อนลด'],
  discount_total: ['discounttotal', 'ส่วนลด'],
  grand_total: ['grandtotal', 'total', 'ยอดสุทธิ', 'ยอดรวม'],
};

function canonicalHeader(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s_.\-/()]+/g, '');
}

const aliasMap = new Map<string, string>();
Object.entries(aliases).forEach(([field, values]) => values.forEach((value) => aliasMap.set(canonicalHeader(value), field)));

function asText(value: unknown) {
  if (value == null) return '';
  return String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value ?? '').replace(/,/g, '').trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRecord(row: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  Object.entries(row).forEach(([header, value]) => {
    const canonical = aliasMap.get(canonicalHeader(header)) || canonicalHeader(header);
    if (canonical && normalized[canonical] == null) normalized[canonical] = value;
  });
  return normalized;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, '0');
}

function cleanText(value: string) {
  return value.normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
}

function cleanCategory(value: string) {
  return cleanText(value).replace(/^\s*\d+\s*[.)\-:]\s*/, '').trim();
}

function parseProductName(value: string, unitDescription: string) {
  const source = cleanText(value).replace(/^[.\-\s]+/, '').trim();
  const trailingPackage = /\s*-\s*([^\-]+)\s*-\s*$/u;
  const match = source.match(trailingPackage);
  const suffix = match?.[1] || '';
  const name = cleanText(match ? source.slice(0, match.index).trim() : source).replace(/[\-–—]+$/, '').trim() || source;
  const weightMatch = `${suffix} ${source}`.match(/(\d+(?:\.\d+)?)\s*(?:[.\s]*)(?:ก\s*[.\s]*ก|กก|กิโลกรัม|kg)\s*\.?/iu);
  const conversion = weightMatch ? Number(weightMatch[1]) : null;
  const unit = cleanText(unitDescription) || cleanText(suffix.replace(/\d+(?:\.\d+)?\s*(?:ก\.?\s*ก\.?|กก\.?|กิโลกรัม|kg)/iu, '').replace(/[.\-]+/g, ' ')) || 'หน่วย';
  const unitName = conversion && !new RegExp(String(conversion)).test(unit) ? `${unit} ${conversion} กก.` : unit;
  return { name, conversion, unitName };
}

function makeGroupKey(name: string, categoryName: string) {
  return `${cleanText(name).toLocaleLowerCase()}::${cleanText(categoryName).toLocaleLowerCase()}`;
}

function makeUnitCode(unitName: string, conversion: number, barcode?: string | null) {
  // POSVis exports the same product/unit label more than once when the old
  // system used a different barcode for each sellable item. The barcode is
  // therefore part of the unit identity when it is available; otherwise the
  // label + conversion remains the deterministic fallback for legacy rows
  // without a barcode.
  const identity = barcode
    ? `${cleanText(unitName).toLocaleLowerCase()}|${conversion}|barcode:${cleanText(barcode)}`
    : `${cleanText(unitName).toLocaleLowerCase()}|${conversion}`;
  return `posvis-${stableHash(identity)}`;
}

function statusFromPosvis(row: Record<string, unknown>, categoryName: string) {
  const statusLabel = cleanText(asText(row.stockstatus || row.stock_status));
  // `เปิดขาย` contains the code-point substring `ปิด` after the leading
  // เ, so check an explicit active status before interpreting a closing
  // status. This keeps `เปิดขายปกติ` sellable while still blocking `ปิดขาย`.
  const explicitlyActive = /เปิดขาย|ขายปกติ|พร้อมขาย/iu.test(statusLabel);
  const explicitlyBlocked = /ระงับ|ยกเลิก|หมด/iu.test(statusLabel) || (!explicitlyActive && /ปิด/iu.test(statusLabel));
  const blocked = explicitlyBlocked || /ยกเลิกจำหน่าย/iu.test(categoryName);
  return { statusLabel: statusLabel || 'ไม่ระบุสถานะ', canSell: !blocked, canReceive: true };
}

export function detectPosvisProductProfile(rowsOrHeaders: Array<Record<string, unknown>> | string[]) {
  const headers = Array.isArray(rowsOrHeaders) && typeof rowsOrHeaders[0] === 'string'
    ? rowsOrHeaders as string[]
    : Object.keys((rowsOrHeaders[0] || {}) as Record<string, unknown>);
  const headerSet = new Set(headers.map(canonicalHeader));
  return POSVIS_PRODUCT_HEADERS.every((header) => headerSet.has(canonicalHeader(header)));
}

export function parsePosvisWorkbook(buffer: ArrayBuffer, fileName: string) {
  const workbook = XLSX.read(buffer, { type: 'array', raw: true, cellDates: false, cellNF: false, cellStyles: false });
  if (!workbook.SheetNames.length) throw new Error(`ไฟล์ ${fileName} ไม่มี worksheet`);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true, blankrows: false });
}

function validatePosvisProductRows(rows: Record<string, unknown>[]): MigrationValidationRow[] {
  const seenBarcodes = new Map<string, number>();
  return rows.map((rawData, index) => {
    const source = normalizeRecord(rawData);
    const errors: string[] = [];
    const warnings: string[] = [];
    const rowNumber = index + 2;
    const barcode = asText(source.productbarcode || source.product_barcode) || null;
    const productName = cleanText(asText(source.productname || source.product_name));
    const categoryName = cleanCategory(asText(source.categorydesc || source.category_desc));
    const unitDescription = cleanText(asText(source.unitdesc || source.unit_desc));
    const nameInfo = parseProductName(productName, unitDescription);
    const groupKey = makeGroupKey(nameInfo.name, categoryName);
    const conversion = nameInfo.conversion || 1;
    // `stock` is also a generic import alias for `quantity`, so prefer the
    // POSVis column before falling back to the normalized alias.
    const stock = asNumber(rawData.stock ?? source.stock ?? source.quantity);
    const costPrice = asNumber(source.costpriceperunit || source.cost_price_per_unit);
    const salePrice = asNumber(source.price);
    const reorderPoint = asNumber(source.pointoforderqty || source.point_of_order_qty);
    const state = statusFromPosvis(source, categoryName);

    if (!barcode) errors.push('missing_product_barcode');
    else if (seenBarcodes.has(barcode)) errors.push('duplicate_product_barcode');
    else seenBarcodes.set(barcode, rowNumber);
    if (!productName) errors.push('missing_product_name');
    if (!categoryName) warnings.push('missing_category');
    if (!unitDescription) errors.push('missing_unit');
    if (stock == null || stock < 0) errors.push('invalid_stock');
    if (costPrice == null || costPrice < 0) errors.push('invalid_cost_price');
    if (salePrice == null || salePrice < 0) errors.push('invalid_sale_price');
    if (reorderPoint == null || reorderPoint < 0) errors.push('invalid_reorder_point');
    if (!nameInfo.conversion) warnings.push('conversion_defaulted_to_one');

    const normalizedData: Record<string, unknown> = {
      external_ref: barcode || `row-${rowNumber}`,
      barcode,
      product_name: nameInfo.name,
      category_name: categoryName || 'ไม่ระบุหมวดหมู่',
      group_key: groupKey,
      sku: `PV-${stableHash(groupKey)}`,
      unit_code: makeUnitCode(nameInfo.unitName, conversion, barcode),
      unit_name: nameInfo.unitName,
      conversion_to_base: conversion,
      stock: stock ?? 0,
      cost_price: costPrice ?? 0,
      sale_price: salePrice ?? 0,
      reorder_point: reorderPoint ?? 0,
      can_sell: state.canSell,
      can_receive: state.canReceive,
      status_label: state.statusLabel,
      warning_codes: warnings,
      unit_inventory_mode: 'separate_unit',
    };
    const allCodes = [...errors, ...warnings];
    return {
      rowNumber,
      externalRef: barcode || `row-${rowNumber}`,
      rawData,
      normalizedData,
      status: errors.length ? 'error' : warnings.length ? 'warning' : 'valid',
      errorCodes: allCodes,
      errorMessage: allCodes.length ? allCodes.join(', ') : null,
    } satisfies MigrationValidationRow;
  });
}

export function buildPosvisProductPreview(rows: MigrationValidationRow[]): PosvisProductPreview {
  const groups = new Map<string, PosvisGroupedProductPreview>();
  const warningMap = new Map<string, PosvisValidationWarning>();
  rows.forEach((row) => {
    const data = row.normalizedData;
    const groupKey = asText(data.group_key);
    if (!groupKey) return;
    const unit: PosvisNormalizedUnitRow = {
      rowNumber: row.rowNumber,
      externalRef: asText(data.external_ref),
      barcode: asText(data.barcode) || null,
      productName: asText(data.product_name),
      categoryName: asText(data.category_name),
      groupKey,
      sku: asText(data.sku),
      unitCode: asText(data.unit_code),
      unitName: asText(data.unit_name),
      conversionToBase: Number(data.conversion_to_base || 1),
      stock: Number(data.stock || 0),
      costPrice: Number(data.cost_price || 0),
      salePrice: Number(data.sale_price || 0),
      reorderPoint: Number(data.reorder_point || 0),
      canSell: Boolean(data.can_sell),
      canReceive: Boolean(data.can_receive),
      statusLabel: asText(data.status_label),
      warningCodes: Array.isArray(data.warning_codes) ? data.warning_codes.map(String) : [],
    };
    const group = groups.get(groupKey) || { groupKey, sku: unit.sku, name: unit.productName, categoryName: unit.categoryName, unitInventoryMode: 'separate_unit' as const, units: [] };
    group.units.push(unit);
    groups.set(groupKey, group);
    unit.warningCodes.forEach((code) => {
      const message = code === 'conversion_defaulted_to_one'
        ? 'อ่านน้ำหนักจากชื่อไม่สำเร็จ จึงใช้ 1 เป็นอัตราแปลง'
        : code === 'missing_category'
          ? 'ไม่พบหมวดสินค้า จะใช้หมวดไม่ระบุ'
          : code === 'duplicate_product_unit'
            ? 'หน่วยนี้ซ้ำกับรายการเดียวกัน (ตรวจ barcode/อัตราแปลงแล้ว)'
            : code;
      const warning = warningMap.get(code) || { code, message, rowNumbers: [] };
      warning.rowNumbers.push(row.rowNumber);
      warningMap.set(code, warning);
    });
  });
  const products = [...groups.values()].sort((left, right) => left.name.localeCompare(right.name, 'th'));
  return {
    products,
    unitCount: products.reduce((sum, product) => sum + product.units.length, 0),
    stockTotal: products.reduce((sum, product) => sum + product.units.reduce((unitSum, unit) => unitSum + unit.stock, 0), 0),
    warningCount: [...warningMap.values()].reduce((sum, warning) => sum + warning.rowNumbers.length, 0),
    warnings: [...warningMap.values()],
  };
}

function normalizeEditedPosvisRow(row: MigrationValidationRow) {
  const data = row.normalizedData;
  const rawCategory = cleanText(asText(data.category_name));
  const categoryName = cleanCategory(rawCategory) || 'ไม่ระบุหมวดหมู่';
  const productName = cleanText(asText(data.product_name));
  const unitName = cleanText(asText(data.unit_name));
  const barcode = asText(data.barcode) || null;
  const conversion = asNumber(data.conversion_to_base);
  const groupKey = makeGroupKey(productName, categoryName);
  const canSell = Boolean(data.can_sell) && !/ยกเลิกจำหน่าย/iu.test(categoryName);
  const statusLabel = /ยกเลิกจำหน่าย/iu.test(categoryName)
    ? 'ยกเลิกจำหน่าย'
    : canSell
      ? 'เปิดขายปกติ'
      : 'ระงับการขาย';

  return {
    ...data,
    external_ref: barcode || asText(data.external_ref) || `row-${row.rowNumber}`,
    barcode,
    product_name: productName,
    category_name: categoryName,
    group_key: groupKey,
    sku: `PV-${stableHash(groupKey)}`,
    unit_code: makeUnitCode(unitName, conversion || 1, barcode),
    unit_name: unitName,
    conversion_to_base: conversion ?? 0,
    stock: asNumber(data.stock) ?? -1,
    cost_price: asNumber(data.cost_price) ?? -1,
    sale_price: asNumber(data.sale_price) ?? -1,
    reorder_point: asNumber(data.reorder_point) ?? -1,
    can_sell: canSell,
    can_receive: true,
    status_label: statusLabel,
    unit_inventory_mode: 'separate_unit',
    warning_codes: Array.isArray(data.warning_codes) ? data.warning_codes.map(String) : [],
  } satisfies Record<string, unknown>;
}

/**
 * Re-validates normalized POSVis rows after an operator edits a dry-run row.
 * The same deterministic grouping/SKU/unit rules are applied again so the
 * preview and the eventual commit always use the exact same shape.
 */
export function revalidatePosvisRows(rows: MigrationValidationRow[]) {
  const seenBarcodes = new Map<string, number>();
  const seenUnits = new Map<string, number>();
  const validated = rows.map((row) => {
    const normalizedData = normalizeEditedPosvisRow(row);
    const errors: string[] = [];
    const warnings: string[] = [];
    const previousWarningCodes = Array.isArray(row.normalizedData.warning_codes)
      ? row.normalizedData.warning_codes.map(String)
      : [];
    const productName = asText(normalizedData.product_name);
    const unitName = asText(normalizedData.unit_name);
    const barcode = asText(normalizedData.barcode);
    const conversion = asNumber(normalizedData.conversion_to_base);
    const stock = asNumber(normalizedData.stock);
    const costPrice = asNumber(normalizedData.cost_price);
    const salePrice = asNumber(normalizedData.sale_price);
    const reorderPoint = asNumber(normalizedData.reorder_point);

    if (!barcode) errors.push('missing_product_barcode');
    else if (seenBarcodes.has(barcode)) errors.push('duplicate_product_barcode');
    else seenBarcodes.set(barcode, row.rowNumber);
    if (!productName) errors.push('missing_product_name');
    const categoryName = cleanCategory(asText(normalizedData.category_name));
    if (!categoryName || (previousWarningCodes.includes('missing_category') && categoryName === 'ไม่ระบุหมวดหมู่')) warnings.push('missing_category');
    if (!unitName) errors.push('missing_unit');
    if (conversion == null || conversion <= 0) errors.push('invalid_conversion');
    if (stock == null || stock < 0) errors.push('invalid_stock');
    if (costPrice == null || costPrice < 0) errors.push('invalid_cost_price');
    if (salePrice == null || salePrice < 0) errors.push('invalid_sale_price');
    if (reorderPoint == null || reorderPoint < 0) errors.push('invalid_reorder_point');
    if (previousWarningCodes.includes('conversion_defaulted_to_one') && conversion === 1) warnings.push('conversion_defaulted_to_one');

    // A unit label is not unique in POSVis. For example, several legacy
    // products can all export as "กิโลกรัม 1 กก." but still represent
    // different sellable units because their barcode differs. unit_code now
    // carries that barcode, so only the same logical unit is rejected here.
    const unitKey = `${asText(normalizedData.group_key)}::${asText(normalizedData.unit_code)}`;
    if (unitKey !== '::') {
      if (seenUnits.has(unitKey)) errors.push('duplicate_product_unit');
      else seenUnits.set(unitKey, row.rowNumber);
    }

    const allCodes = [...new Set([...errors, ...warnings])];
    return {
      ...row,
      externalRef: asText(normalizedData.external_ref) || null,
      normalizedData: { ...normalizedData, warning_codes: warnings },
      status: errors.length ? 'error' : warnings.length ? 'warning' : 'valid',
      errorCodes: allCodes,
      errorMessage: allCodes.length ? allCodes.join(', ') : null,
    } satisfies MigrationValidationRow;
  });

  return validated;
}

export function validatePosvisRows(dataType: PosvisDataType, rows: Record<string, unknown>[]): MigrationValidationRow[] {
  if (dataType === 'posvis_products') return validatePosvisProductRows(rows);
  return rows.map((rawData, index) => {
    const source = normalizeRecord(rawData);
    const normalizedData: Record<string, unknown> = {};
    const errors: string[] = [];
    const requireText = (field: string, code: string) => {
      const value = asText(source[field]); normalizedData[field] = value;
      if (!value) errors.push(code);
      return value;
    };

    if (dataType === 'branches') {
      const code = requireText('code', 'missing_branch_code'); requireText('name', 'missing_name'); normalizedData.external_ref = asText(source.external_ref) || code;
    } else if (dataType === 'products') {
      const sku = requireText('sku', 'missing_sku'); requireText('name', 'missing_name'); normalizedData.external_ref = asText(source.external_ref) || sku; normalizedData.barcode = asText(source.barcode) || null; normalizedData.category = asText(source.category) || null; normalizedData.unit = asText(source.unit) || 'ชิ้น'; normalizedData.conversion = Math.max(0.001, asNumber(source.conversion) || 1); normalizedData.price = Math.max(0, asNumber(source.price) || 0); normalizedData.cost = Math.max(0, asNumber(source.cost) || 0);
    } else if (dataType === 'customers') {
      requireText('name', 'missing_name'); normalizedData.phone = asText(source.phone) || null; normalizedData.email = asText(source.email) || null; normalizedData.member_code = asText(source.member_code) || null; normalizedData.external_ref = asText(source.external_ref) || asText(source.member_code) || asText(source.phone); if (!normalizedData.external_ref) errors.push('missing_external_ref');
    } else if (dataType === 'suppliers') {
      const code = asText(source.code); requireText('name', 'missing_name'); normalizedData.code = code || null; normalizedData.phone = asText(source.phone) || null; normalizedData.email = asText(source.email) || null; normalizedData.tax_id = asText(source.tax_id) || null; normalizedData.external_ref = asText(source.external_ref) || code; if (!normalizedData.external_ref) errors.push('missing_external_ref');
    } else if (dataType === 'stock') {
      const branchCode = requireText('branch_code', 'missing_branch_code'); const sku = requireText('sku', 'missing_sku'); const quantity = asNumber(source.quantity) ?? -1; normalizedData.quantity = quantity; if (quantity < 0) errors.push('negative_quantity'); normalizedData.external_ref = `${branchCode}:${sku}`;
    } else if (dataType === 'legacy_sales') {
      const documentNumber = requireText('document_number', 'missing_document_number'); requireText('branch_code', 'missing_branch_code'); const transactionAt = asText(source.transaction_at); normalizedData.transaction_at = transactionAt; if (!transactionAt || Number.isNaN(Date.parse(transactionAt))) errors.push('invalid_transaction_date'); normalizedData.external_ref = asText(source.external_ref) || documentNumber; normalizedData.subtotal = Math.max(0, asNumber(source.subtotal) || 0); normalizedData.discount_total = Math.max(0, asNumber(source.discount_total) || 0); normalizedData.grand_total = Math.max(0, asNumber(source.grand_total) || 0);
    }

    const externalRef = asText(normalizedData.external_ref) || null;
    return { rowNumber: index + 2, externalRef, rawData, normalizedData, status: errors.length ? 'error' : 'valid', errorCodes: errors, errorMessage: errors.length ? errors.join(', ') : null } satisfies MigrationValidationRow;
  });
}
