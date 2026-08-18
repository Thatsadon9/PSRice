import * as XLSX from '@e965/xlsx';
import { buildCommerceReport, reportExportRows } from '@/lib/commerceReportsServer';
import { canAccessCommerceBranch, getCommerceRequestContext, hasCommercePermission, requireSupabaseAdmin } from '@/lib/commerceServer';

export const runtime = 'nodejs';

type ExportRow = Record<string, unknown>;

function workbookResponse(workbook: XLSX.WorkBook, filename: string) {
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'stock';
    if (type === 'report') {
      const { report } = await buildCommerceReport(request);
      const rows = reportExportRows(report);
      const workbook = XLSX.utils.book_new();
      Object.entries(rows).forEach(([name, values]) => {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(values), name.slice(0, 31));
      });
      return workbookResponse(workbook, `ps-rice-report-${report.filters.from}-${report.filters.to}.xlsx`);
    }

    const context = await getCommerceRequestContext(request);
    if (!context) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const branchId = url.searchParams.get('branch_id') || context.profile.branch_id || '';
    if (!canAccessCommerceBranch(context.profile, branchId)) return Response.json({ error: 'ไม่มีสิทธิ์สาขา' }, { status: 403 });
    const permission = type === 'sales' ? 'reports.view' : 'inventory.read';
    if (!hasCommercePermission(context.profile, permission, branchId) && !hasCommercePermission(context.profile, 'catalog.read', branchId)) return Response.json({ error: 'ไม่มีสิทธิ์ส่งออกข้อมูล' }, { status: 403 });
    const admin = requireSupabaseAdmin();
    let rows: Record<string, unknown>[] = [];
    let title = 'Stock';
    if (type === 'sales') {
      const from = url.searchParams.get('from') || new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      const to = url.searchParams.get('to') || new Date().toISOString().slice(0, 10);
      const { data, error } = await admin.from('commerce_sales_reporting').select('document_number,transaction_at,status,subtotal,discount_total,grand_total,is_legacy').eq('branch_id', branchId).gte('transaction_at', `${from}T00:00:00+07:00`).lte('transaction_at', `${to}T23:59:59+07:00`).order('transaction_at');
      if (error) throw error;
      rows = (data || []).map((row: ExportRow) => ({ 'เลขที่เอกสาร': row.document_number, 'วันเวลา': row.transaction_at, 'สถานะ': row.status, 'ยอดก่อนลด': row.subtotal, 'ส่วนลด': row.discount_total, 'ยอดสุทธิ': row.grand_total, 'ข้อมูลเดิม POSVis': row.is_legacy ? 'ใช่' : 'ไม่ใช่' }));
      title = 'Sales';
    } else {
      const [balancesResult, productsResult, settingsResult, pricesResult, availabilityResult] = await Promise.all([
        admin.from('stock_balances').select('product_id,on_hand,reserved,damaged,in_transit,updated_at').eq('branch_id', branchId),
        admin.from('products').select('id,sku,barcode,name,base_unit_code,default_sale_price,default_cost_price,reorder_point').order('sku'),
        admin.from('branch_inventory_settings').select('product_id,cost_price,reorder_point,note').eq('branch_id', branchId),
        admin.from('product_prices').select('product_id,price').eq('branch_id', branchId).eq('customer_type', 'retail').eq('is_inventory_default', true).eq('is_active', true),
        admin.from('branch_product_availability').select('product_id,is_active').eq('branch_id', branchId),
      ]);
      const firstError = [balancesResult.error, productsResult.error, settingsResult.error, pricesResult.error, availabilityResult.error].find(Boolean);
      if (firstError) throw firstError;
      const byProduct = new Map((balancesResult.data || []).map((row: ExportRow) => [row.product_id, row]));
      const settingsByProduct = new Map((settingsResult.data || []).map((row: ExportRow) => [row.product_id, row]));
      const priceByProduct = new Map((pricesResult.data || []).map((row: ExportRow) => [row.product_id, row.price]));
      const availabilityByProduct = new Map((availabilityResult.data || []).map((row: ExportRow) => [row.product_id, row.is_active]));
      rows = (productsResult.data || []).map((product: ExportRow) => {
        const balance = byProduct.get(product.id);
        const setting = settingsByProduct.get(product.id);
        const onHand = Number(balance?.on_hand || 0);
        const reserved = Number(balance?.reserved || 0);
        const damaged = Number(balance?.damaged || 0);
        return { SKU: product.sku, Barcode: product.barcode, 'ชื่อสินค้า': product.name, 'หน่วยฐาน': product.base_unit_code, 'ราคาขาย': priceByProduct.get(product.id) ?? product.default_sale_price, 'ต้นทุน': setting?.cost_price ?? product.default_cost_price, 'คงเหลือ': onHand, 'จอง': reserved, 'เสียหาย': damaged, 'ระหว่างโอน': balance?.in_transit || 0, 'พร้อมขาย': Math.max(0, onHand - reserved - damaged), 'จุดสั่งซื้อ': setting?.reorder_point ?? product.reorder_point, 'สถานะขาย': availabilityByProduct.get(product.id) === false ? 'หยุดขาย' : 'เปิดขาย', 'หมายเหตุ': setting?.note || '', 'อัปเดตล่าสุด': balance?.updated_at || '' };
      });
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), title);
    return workbookResponse(workbook, `ps-rice-${title.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error && typeof error.status === 'number' ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : 'ส่งออกไม่สำเร็จ' }, { status });
  }
}
