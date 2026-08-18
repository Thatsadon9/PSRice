'use client';

import Select from '@/components/ui/Select';
import { FormEvent, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommerceInitialState } from '@/components/commerce/CommerceInitialState';
import { CommerceShell } from '@/components/commerce/CommerceShell';
import { getAccessToken } from '@/lib/supabase';

type Batch = { id: string; file_name: string; data_type: string; branch_id?: string | null; status: string; dry_run: boolean; row_count: number; valid_count: number; error_count: number; summary: Record<string, unknown>; created_at: string; completed_at: string | null };
type Row = { id: string; row_number: number; external_ref: string | null; normalized_data: Record<string, unknown>; status: string; error_codes?: unknown; error_message: string | null };
type Branch = { id: string; name: string; code: string };
type PreviewUnit = { rowNumber: number; unitName: string; conversionToBase: number; stock: number; costPrice: number; salePrice: number; reorderPoint: number; canSell: boolean; canReceive: boolean; barcode: string | null };
type PreviewProduct = { name: string; categoryName: string; sku: string; units: PreviewUnit[] };
type PosvisPreview = { products: PreviewProduct[]; unitCount: number; stockTotal: number; warningCount: number; warnings: Array<{ code: string; message: string; rowNumbers: number[] }> };
type EditableKey = 'product_name' | 'category_name' | 'unit_name' | 'barcode' | 'conversion_to_base' | 'sale_price' | 'cost_price' | 'reorder_point' | 'stock' | 'can_sell';
type EditingCell = { rowId: string; key: EditableKey };
type Toast = { tone: 'success' | 'error' | 'info'; message: string };

const dataTypes = [['auto', 'ตรวจจับอัตโนมัติ'], ['posvis_products', 'POSVis — สินค้า ราคา หน่วย และสต๊อก'], ['products', 'สินค้า ราคา และหน่วย'], ['product_images', 'รูปสินค้า ZIP (ชื่อไฟล์ = SKU)'], ['customers', 'ลูกค้า / สมาชิก'], ['suppliers', 'ผู้ขาย'], ['stock', 'ยอดเปิดสต๊อก'], ['legacy_sales', 'ประวัติขายย้อนหลัง 2 ปี']];
const templates: Record<string, string[]> = { products: ['external_ref', 'sku', 'barcode', 'name', 'category', 'unit', 'conversion', 'price', 'cost'], customers: ['external_ref', 'name', 'phone', 'email', 'member_code'], suppliers: ['external_ref', 'code', 'name', 'phone', 'email', 'tax_id'], stock: ['branch_code', 'sku', 'quantity'], legacy_sales: ['external_ref', 'branch_code', 'document_number', 'transaction_at', 'subtotal', 'discount_total', 'grand_total'] };

function numericValue(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown) {
  return value === true || String(value).toLowerCase() === 'true' || String(value) === '1';
}

function stringArrayValue(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number').map(String).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function buildPosvisPreviewFromRows(rows: Row[], fallback?: PosvisPreview) {
  if (!rows.length) return fallback;
  const productMap = new Map<string, PreviewProduct>();
  const warningMap = new Map<string, number[]>();
  rows.forEach((row) => {
    const data = row.normalized_data || {};
    const groupKey = String(data.group_key || `${data.product_name || 'ไม่มีชื่อสินค้า'}::${data.category_name || ''}`);
    const product = productMap.get(groupKey) || { name: String(data.product_name || 'ไม่มีชื่อสินค้า'), categoryName: String(data.category_name || 'ไม่มีหมวด'), sku: String(data.sku || groupKey), units: [] };
    product.name = String(data.product_name || product.name);
    product.categoryName = String(data.category_name || product.categoryName);
    product.units.push({ rowNumber: row.row_number, unitName: String(data.unit_name || 'หน่วย'), conversionToBase: numericValue(data.conversion_to_base, 1), stock: numericValue(data.stock), costPrice: numericValue(data.cost_price), salePrice: numericValue(data.sale_price), reorderPoint: numericValue(data.reorder_point), canSell: booleanValue(data.can_sell), canReceive: booleanValue(data.can_receive), barcode: data.barcode ? String(data.barcode) : null });
    productMap.set(groupKey, product);
    const codes = [...stringArrayValue(row.error_codes), ...stringArrayValue(data.warning_codes)];
    codes.forEach((code) => { const numbers = warningMap.get(code) || []; if (!numbers.includes(row.row_number)) numbers.push(row.row_number); warningMap.set(code, numbers); });
  });
  const warningMessages: Record<string, string> = { existing_barcode_conflict: 'barcode ชนกับข้อมูลเดิม', duplicate_product_unit: 'หน่วยนี้ซ้ำกับรายการเดียวกัน (ตรวจ barcode/อัตราแปลงแล้ว)', invalid_conversion: 'อัตราแปลงไม่ถูกต้อง', missing_barcode: 'ไม่มี barcode', missing_product_name: 'ไม่มีชื่อสินค้า', missing_price: 'ไม่มีราคาขาย' };
  const warnings = [...warningMap.entries()].map(([code, rowNumbers]) => ({ code, message: warningMessages[code] || code, rowNumbers }));
  const products = [...productMap.values()];
  return { products, unitCount: products.reduce((total, product) => total + product.units.length, 0), stockTotal: products.reduce((total, product) => total + product.units.reduce((units, unit) => total + unit.stock * unit.conversionToBase, 0), 0), warningCount: warnings.length, warnings } satisfies PosvisPreview;
}

function buildOptimisticEditRows(rows: Row[], rowId: string, key: EditableKey, value: unknown) {
  const nextRows = rows.map((row) => ({ ...row, normalized_data: { ...row.normalized_data } }));
  const target = nextRows.find((row) => row.id === rowId);
  if (!target) return rows;
  target.normalized_data[key] = value;
  if (key !== 'sale_price' && key !== 'cost_price') return nextRows;
  const groupKey = String(target.normalized_data.group_key || '').trim();
  const targetConversion = numericValue(target.normalized_data.conversion_to_base, 0);
  const targetPrice = numericValue(value, Number.NaN);
  if (!groupKey || targetConversion <= 0 || !Number.isFinite(targetPrice) || targetPrice < 0) return nextRows;
  nextRows.forEach((row) => {
    if (String(row.normalized_data.group_key || '').trim() !== groupKey) return;
    const conversion = numericValue(row.normalized_data.conversion_to_base, 0);
    if (conversion > 0) row.normalized_data[key] = Math.round(((targetPrice / targetConversion) * conversion + Number.EPSILON) * 100) / 100;
  });
  return nextRows;
}

async function request(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch(path, { ...init, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(!(init?.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'ทำรายการไม่สำเร็จ');
  return body;
}

export default function MigrationCenterWorkspace() {
  const [batches, setBatches] = useState<Batch[]>([]); const [rows, setRows] = useState<Row[]>([]); const [branches, setBranches] = useState<Branch[]>([]); const [currentBranchId, setCurrentBranchId] = useState(''); const [selectedBatchId, setSelectedBatchId] = useState(''); const [dataType, setDataType] = useState('auto'); const [file, setFile] = useState<File | null>(null); const [status, setStatus] = useState('กำลังโหลด Migration Center…'); const [loading, setLoading] = useState(true); const [working, setWorking] = useState(false); const [confirmState, setConfirmState] = useState<{ batch: Batch; action: 'commit' | 'rollback' } | null>(null); const [editingCell, setEditingCell] = useState<EditingCell | null>(null); const [editValue, setEditValue] = useState(''); const [editError, setEditError] = useState('');
  const [savingCell, setSavingCell] = useState<string | null>(null); const [deleteRowState, setDeleteRowState] = useState<Row | null>(null); const [deletingRowId, setDeletingRowId] = useState<string | null>(null); const [toast, setToast] = useState<Toast | null>(null); const [leftPaneRatio, setLeftPaneRatio] = useState(31); const [isResizing, setIsResizing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveInFlightRef = useRef<string | null>(null);
  const splitPaneRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!toast) return undefined; const timer = window.setTimeout(() => setToast(null), 4200); return () => window.clearTimeout(timer); }, [toast]);

  const load = useCallback(async (batchId?: string) => {
    try {
      const [response, context] = await Promise.all([request(`/api/commerce/migration${batchId ? `?batch_id=${encodeURIComponent(batchId)}` : ''}`) as Promise<{ batches: Batch[]; rows: Row[]; branch_id?: string | null }>, request('/api/commerce/context') as Promise<{ branches: Branch[] }>]);
      setBatches(response.batches); setBranches(context.branches); setRows(response.rows); setCurrentBranchId(response.branch_id || ''); if (batchId) setSelectedBatchId(batchId); setStatus(response.batches.length ? 'เลือก batch เพื่อดูผลตรวจสอบและนำเข้าจริง' : 'ยังไม่มี batch — อัปโหลดไฟล์ POSVis เพื่อเริ่ม Dry run');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'โหลด Migration Center ไม่สำเร็จ'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const upload = async (event: FormEvent) => {
    event.preventDefault(); if (!file) return;
    try { setWorking(true); setStatus('กำลังอ่านไฟล์ ตรวจรูปแบบ และจัดกลุ่มสินค้า/หน่วย…'); const form = new FormData(); form.set('file', file); form.set('data_type', dataType); const response = await request('/api/commerce/migration', { method: 'POST', body: form }) as { batch: Batch; duplicate?: boolean }; setDataType(response.batch.data_type); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; await load(response.batch.id); const conflictCount = Number(response.batch.summary?.conflict_count || 0); setStatus(response.duplicate ? 'ไฟล์นี้เคยตรวจแล้ว ระบบไม่สร้าง batch ซ้ำ' : conflictCount ? `พบ conflict ${conflictCount} รายการ — ตรวจสอบก่อนนำเข้าจริง` : response.batch.error_count ? `พบข้อผิดพลาด ${response.batch.error_count} แถว — แก้ไขในตารางได้ทันที` : response.batch.status === 'completed' ? 'นำเข้ารูปและบีบอัดเรียบร้อยแล้ว' : 'ตรวจสอบผ่านแล้ว แก้ไขค่าในตารางได้ก่อนนำเข้าจริง'); } catch (error) { setStatus(error instanceof Error ? error.message : 'ตรวจไฟล์ไม่สำเร็จ'); } finally { setWorking(false); }
  };

  const performAction = async () => {
    if (!confirmState) return; const { batch, action: nextAction } = confirmState; setConfirmState(null);
    try { setWorking(true); setStatus(nextAction === 'commit' ? 'กำลังนำเข้าจริงแบบ transaction เดียว…' : 'กำลัง rollback batch…'); const result = await request('/api/commerce/migration', { method: 'PATCH', body: JSON.stringify({ batch_id: batch.id, action: nextAction }) }) as { imported?: number; result?: { products?: number; units?: number } }; await load(batch.id); setStatus(nextAction === 'commit' ? `นำเข้าสำเร็จ ${result.result?.products || 0} สินค้าแม่ · ${result.result?.units || result.imported || 0} หน่วย` : 'Rollback batch แล้ว'); } catch (error) { setStatus(error instanceof Error ? error.message : 'ทำรายการ batch ไม่สำเร็จ'); } finally { setWorking(false); }
  };

  const startCellEditing = (row: Row, key: EditableKey) => { if (saveInFlightRef.current) return; setEditingCell({ rowId: row.id, key }); setEditValue(String(row.normalized_data[key] ?? '')); setEditError(''); };
  const selectBatch = (batch: Batch) => { setDataType(batch.data_type); cancelCellEditing(); void load(batch.id); };
  const cancelCellEditing = () => { setEditingCell(null); setEditValue(''); setEditError(''); };
  const commitCellValue = async (rowId: string, key: EditableKey, value: unknown) => {
    if (!selectedBatch) return;
    const requestKey = `${rowId}:${key}`;
    if (saveInFlightRef.current) return;
    const row = rows.find((candidate) => candidate.id === rowId);
    if (!row) return;
    const previousRows = rows;
    const previousValue = row.normalized_data[key];
    const nextValue = key === 'can_sell' ? booleanValue(value) : typeof value === 'string' ? value.trim() : value;
    if (String(previousValue ?? '') === String(nextValue ?? '')) { cancelCellEditing(); return; }
    const optimisticRows = buildOptimisticEditRows(rows, rowId, key, nextValue);
    setRows(optimisticRows);
    cancelCellEditing();
    saveInFlightRef.current = requestKey;
    setSavingCell(requestKey); setEditError(''); setToast({ tone: 'info', message: key === 'sale_price' || key === 'cost_price' ? 'บันทึกค่าและปรับราคาหน่วยที่สัมพันธ์กันแล้ว กำลังตรวจสอบ…' : 'บันทึกค่าแล้ว กำลังตรวจสอบข้อมูล…' }); setStatus('บันทึกค่าในหน้าจอแล้ว กำลังตรวจสอบ batch ใหม่…');
    try {
      const response = await request('/api/commerce/migration', { method: 'PATCH', body: JSON.stringify({ action: 'edit_rows', batch_id: selectedBatch.id, rows: [{ id: rowId, data: { [key]: nextValue } }] }) }) as { batch?: Batch; rows?: Row[] };
      if (response.batch) setBatches((current) => current.map((batch) => batch.id === response.batch?.id ? response.batch as Batch : batch));
      if (response.rows?.length) setRows(response.rows);
      setToast({ tone: 'success', message: key === 'sale_price' || key === 'cost_price' ? 'บันทึกแล้ว และอัปเดตราคาหน่วยที่สัมพันธ์กันเรียบร้อย' : 'บันทึกและตรวจสอบข้อมูลเรียบร้อย' }); setStatus('บันทึกค่าแล้ว และตรวจสอบ batch ใหม่เรียบร้อย');
    } catch (error) { const message = error instanceof Error ? error.message : 'บันทึกค่าไม่สำเร็จ'; setRows(previousRows); setEditError(message); setToast({ tone: 'error', message: `บันทึกไม่สำเร็จ: ${message} — คืนค่าเดิมแล้ว` }); setStatus(message); } finally { if (saveInFlightRef.current === requestKey) saveInFlightRef.current = null; setSavingCell(null); }
  };
  const saveCellEditing = () => { if (editingCell) void commitCellValue(editingCell.rowId, editingCell.key, editValue); };
  const toggleSell = (row: Row) => { void commitCellValue(row.id, 'can_sell', !booleanValue(row.normalized_data.can_sell)); };
  const requestDeleteRow = (row: Row) => { if (!working && !deletingRowId) { cancelCellEditing(); setDeleteRowState(row); } };
  const performDeleteRow = async () => {
    if (!deleteRowState || !selectedBatch) return;
    const row = deleteRowState;
    setDeleteRowState(null);
    setDeletingRowId(row.id);
    setStatus('กำลังลบรายการและตรวจสอบข้อมูลใหม่…');
    try {
      const response = await request('/api/commerce/migration', { method: 'PATCH', body: JSON.stringify({ action: 'delete_rows', batch_id: selectedBatch.id, row_ids: [row.id] }) }) as { batch?: Batch; rows?: Row[] };
      if (response.batch) setBatches((current) => current.map((batch) => batch.id === response.batch?.id ? response.batch as Batch : batch));
      setRows(response.rows || []);
      setToast({ tone: 'success', message: 'ลบรายการแล้ว และตรวจสอบข้อมูลใหม่เรียบร้อย' });
      setStatus('ลบรายการแล้ว และตรวจสอบ batch ใหม่เรียบร้อย');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ลบรายการไม่สำเร็จ';
      setToast({ tone: 'error', message });
      setStatus(message);
    } finally { setDeletingRowId(null); }
  };

  const updateSplitFromPointer = (clientX: number) => { const rect = splitPaneRef.current?.getBoundingClientRect(); if (!rect || rect.width <= 0) return; const nextRatio = ((clientX - rect.left) / rect.width) * 100; setLeftPaneRatio(Math.min(44, Math.max(22, nextRatio))); };
  const startSplitResize = (event: ReactPointerEvent<HTMLDivElement>) => { if (window.innerWidth < 1280) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setIsResizing(true); updateSplitFromPointer(event.clientX); };
  const stopSplitResize = (event: ReactPointerEvent<HTMLDivElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setIsResizing(false); };
  const moveSplitResize = (event: ReactPointerEvent<HTMLDivElement>) => { if (isResizing) updateSplitFromPointer(event.clientX); };
  const nudgeSplitResize = (delta: number) => setLeftPaneRatio((current) => Math.min(44, Math.max(22, current + delta)));

  const downloadTemplate = async () => { if (!templates[dataType]) return; const XLSX = await import('@e965/xlsx'); const worksheet = XLSX.utils.aoa_to_sheet([templates[dataType], templates[dataType].map(() => '')]); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'POSVis Import'); XLSX.writeFile(workbook, `ps-rice-${dataType}-template.xlsx`); };
  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId); const selectedBranchName = selectedBatch?.branch_id ? branches.find((branch) => branch.id === selectedBatch.branch_id)?.name : branches.find((branch) => branch.id === currentBranchId)?.name; const posvisPreview = useMemo(() => selectedBatch?.data_type === 'posvis_products' ? buildPosvisPreviewFromRows(rows, selectedBatch.summary?.posvis_preview as PosvisPreview | undefined) : undefined, [rows, selectedBatch]); const hasConflict = Number(selectedBatch?.summary?.conflict_count || 0) > 0;

  if (loading) return <CommerceShell section="backoffice"><main className="mx-auto max-w-[1480px] px-4 py-5"><CommerceInitialState status={status} onRetry={() => void load()} label="กำลังโหลด Migration Center…" /></main></CommerceShell>;
  return <CommerceShell section="backoffice"><main className="mx-auto max-w-[1480px] px-4 py-5 sm:px-5">
    <header className="border-b border-slate-200 pb-4"><p className="text-xs font-medium text-primary-800">Commerce / Migration</p><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="mt-1 text-2xl font-semibold tracking-tight">ย้ายข้อมูลจาก POSVis</h1><p className="mt-1 text-sm text-slate-500">{status}</p></div><div className="border border-primary-100 bg-primary-50 px-3 py-2 text-right"><p className="text-[11px] text-slate-500">สาขาปลายทางจาก Commerce</p><p className="text-sm font-semibold text-primary-900">{selectedBranchName || 'สาขาที่กำลังเลือกอยู่'}</p></div></div></header>
    <section id="migration-upload" className="mt-5 grid gap-5 border border-slate-200 bg-white p-4 lg:grid-cols-[13rem_minmax(0,1fr)_auto]"><div><h2 className="text-sm font-semibold">1. Dry run</h2><p className="mt-1 text-xs leading-5 text-slate-500">ตรวจรูปแบบไฟล์ ข้อมูลซ้ำ และการจับคู่สินค้า/หน่วยก่อนนำเข้าจริง</p></div><form onSubmit={upload} className="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)_auto]"><Select value={dataType} onChange={(event) => { setDataType(event.target.value); setFile(null); }} className="h-10 border border-slate-300 bg-white px-2 text-sm">{dataTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><input ref={fileInputRef} id="migration-file-input" required type="file" accept={dataType === 'product_images' ? '.zip' : '.xlsx,.xls,.csv'} onChange={(event) => setFile(event.target.files?.[0] || null)} className="h-10 min-w-0 border border-slate-300 bg-white px-2 py-1.5 text-sm file:mr-3 file:border-0 file:bg-slate-100 file:px-2 file:py-1" /><button disabled={working || !file} className="h-10 bg-primary-800 px-4 text-sm font-semibold text-white disabled:bg-slate-300">{working ? 'กำลังตรวจ…' : 'อัปโหลดและตรวจ'}</button></form><button type="button" disabled={!templates[dataType]} onClick={() => void downloadTemplate()} className="h-10 border border-slate-300 px-4 text-sm font-medium disabled:text-slate-300">ดาวน์โหลด Template</button></section>
    <div ref={splitPaneRef} className={`mt-5 grid gap-5 xl:grid-cols-[minmax(0,var(--migration-left))_0.75rem_minmax(0,1fr)] ${isResizing ? 'select-none' : ''}`} style={{ '--migration-left': `${leftPaneRatio}%` } as CSSProperties}>
      <section className="border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold">Migration batches</h2></div><div className="max-h-[65dvh] divide-y divide-slate-100 overflow-y-auto">{batches.map((batch) => { const conflicts = Number(batch.summary?.conflict_count || 0); return <button type="button" key={batch.id} onClick={() => selectBatch(batch)} className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${selectedBatchId === batch.id ? 'bg-primary-50' : ''}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{batch.file_name}</p><p className="mt-1 text-xs text-slate-500">{dataTypes.find(([value]) => value === batch.data_type)?.[1] || batch.data_type} · {new Date(batch.created_at).toLocaleString('th-TH')}</p></div><span className={`text-xs font-semibold ${batch.status === 'completed' ? 'text-primary-800' : batch.error_count ? 'text-red-700' : conflicts ? 'text-red-700' : 'text-amber-700'}`}>{batch.status === 'ready' && conflicts ? 'มี conflict' : batch.status}</span></div><p className="mt-2 text-xs text-slate-500">ทั้งหมด {batch.row_count} · ผ่าน {batch.valid_count} · ผิด {batch.error_count}{conflicts ? ` · conflict ${conflicts}` : ''}</p></button>; })}{!batches.length ? <p className="px-4 py-12 text-center text-sm text-slate-500">ยังไม่มี batch</p> : null}</div></section>
      <div role="separator" aria-orientation="vertical" aria-label="ปรับขนาดแผง Migration" aria-valuemin={22} aria-valuemax={44} aria-valuenow={Math.round(leftPaneRatio)} tabIndex={0} onPointerDown={startSplitResize} onPointerMove={moveSplitResize} onPointerUp={stopSplitResize} onPointerCancel={stopSplitResize} onKeyDown={(event) => { if (event.key === 'ArrowLeft') { event.preventDefault(); nudgeSplitResize(-2); } if (event.key === 'ArrowRight') { event.preventDefault(); nudgeSplitResize(2); } }} className="group hidden cursor-col-resize items-center justify-center rounded-sm outline-none hover:bg-primary-50 focus:bg-primary-50 xl:flex"><span className="h-14 w-1 rounded-full bg-slate-300 transition-colors group-hover:bg-primary-700 group-focus:bg-primary-700" /></div>
      <section className="min-w-0 border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div><h2 className="text-sm font-semibold">2. ตรวจยอดและนำเข้าจริง</h2><p className="mt-1 text-xs text-slate-500">ข้อมูล POSVis จะสร้างสินค้าแม่และหน่วยแยก พร้อมราคา ต้นทุน และยอดเปิดสต๊อกตามสาขา</p></div>{selectedBatch ? <div className="flex flex-wrap gap-2"><button type="button" disabled={working} onClick={() => fileInputRef.current?.click()} className="h-9 border border-primary-700 px-3 text-xs font-semibold text-primary-800 hover:bg-primary-50 disabled:border-slate-300 disabled:text-slate-300">+ เพิ่มไฟล์</button>{selectedBatch.status === 'ready' && !hasConflict ? <button disabled={working} onClick={() => setConfirmState({ batch: selectedBatch, action: 'commit' })} className="h-9 bg-primary-800 px-4 text-xs font-semibold text-white disabled:bg-slate-300">นำเข้าจริง</button> : null}{selectedBatch.status === 'completed' ? <button disabled={working} onClick={() => setConfirmState({ batch: selectedBatch, action: 'rollback' })} className="h-9 border border-red-300 px-4 text-xs font-medium text-red-700">Rollback</button> : null}</div> : null}</div>
        {selectedBatch ? <><dl className="grid border-b border-slate-200 bg-slate-50 sm:grid-cols-4"><Summary label="แถวทั้งหมด" value={selectedBatch.row_count} /><Summary label="พร้อมนำเข้า" value={selectedBatch.valid_count} /><Summary label="ข้อผิดพลาด" value={selectedBatch.error_count} danger={selectedBatch.error_count > 0} /><Summary label={selectedBatch.data_type === 'posvis_products' ? 'Conflict' : 'Duplicate ในไฟล์'} value={Number(selectedBatch.summary?.[selectedBatch.data_type === 'posvis_products' ? 'conflict_count' : 'duplicate_external_refs'] || 0)} danger={hasConflict} /></dl>{posvisPreview ? <PosvisPreview preview={posvisPreview} rows={rows} editable={selectedBatch.data_type === 'posvis_products' && ['ready', 'uploaded'].includes(selectedBatch.status)} editingCell={editingCell} editValue={editValue} editError={editError} onEditCell={startCellEditing} onChange={setEditValue} onSave={saveCellEditing} onCancel={cancelCellEditing} onToggleSell={toggleSell} onDeleteRow={requestDeleteRow} deletingRowId={deletingRowId} savingCell={savingCell} /> : null}<div className="w-full overflow-hidden"><table className="w-full table-fixed text-left text-xs"><colgroup><col className="w-[10%]" /><col className="w-[18%]" /><col className="w-[40%]" /><col className="w-[14%]" /><col className="w-[18%]" /></colgroup><thead><tr className="border-b border-slate-200 text-slate-500"><th className="px-2 py-2">แถว</th><th className="px-2 py-2">รหัสเดิม</th><th className="px-2 py-2">ข้อมูลที่ normalize</th><th className="px-2 py-2">สถานะ</th><th className="px-2 py-2">ปัญหา</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-slate-100 align-top"><td className="break-words px-2 py-2 tabular-nums">{row.row_number}</td><td className="break-all px-2 py-2 font-mono">{row.external_ref || '-'}</td><td className="break-words px-2 py-2 text-slate-600">{Object.entries(row.normalized_data || {}).slice(0, 6).map(([key, value]) => `${key}: ${String(value ?? '-')}`).join(' · ')}</td><td className={`break-words px-2 py-2 font-semibold ${row.status === 'error' ? 'text-red-700' : row.status === 'imported' ? 'text-primary-800' : row.status === 'warning' ? 'text-amber-700' : 'text-slate-700'}`}>{row.status}</td><td className="break-words px-2 py-2 text-red-700">{row.error_message || '-'}</td></tr>)}{!rows.length ? <tr><td colSpan={5} className="px-4 py-16 text-center text-sm text-slate-500">เลือก batch ด้านซ้ายเพื่อดูรายละเอียด</td></tr> : null}</tbody></table></div></> : <div className="grid min-h-72 place-items-center text-sm text-slate-500">เลือก batch เพื่อดูผลตรวจสอบ</div>}
      </section>
    </div>
    {toast ? <div role="status" aria-live="polite" className={`fixed bottom-5 right-5 z-40 max-w-sm border px-4 py-3 text-sm font-medium shadow-xl ${toast.tone === 'success' ? 'border-primary-200 bg-primary-50 text-primary-900' : toast.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-sky-200 bg-sky-50 text-sky-900'}`}>{toast.message}</div> : null}
    {confirmState ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="migration-confirm-title" className="w-full max-w-md border border-slate-200 bg-white p-5 shadow-2xl"><h2 id="migration-confirm-title" className="text-lg font-semibold text-slate-900">{confirmState.action === 'commit' ? 'ยืนยันนำเข้าข้อมูลจริง' : 'ยืนยัน Rollback batch'}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{confirmState.action === 'commit' ? `ระบบจะสร้าง/อัปเดตสินค้า ${confirmState.batch.file_name} และเพิ่มยอดเปิดสต๊อกตามหน่วยในสาขาปัจจุบัน การทำซ้ำจะไม่สร้าง movement ซ้ำ` : 'ข้อมูล master ที่สร้างจาก batch นี้จะถูกปิดใช้งาน และไม่ลบเอกสารจริง'}</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setConfirmState(null)} className="h-10 border border-slate-300 px-4 text-sm">ยกเลิก</button><button type="button" onClick={() => void performAction()} className={`h-10 px-4 text-sm font-semibold text-white ${confirmState.action === 'commit' ? 'bg-primary-800' : 'bg-red-700'}`}>{confirmState.action === 'commit' ? 'ยืนยันนำเข้า' : 'ยืนยัน Rollback'}</button></div></div></div> : null}
    {deleteRowState ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="migration-delete-title" className="w-full max-w-md border border-slate-200 bg-white p-5 shadow-2xl"><h2 id="migration-delete-title" className="text-lg font-semibold text-slate-900">ลบรายการนี้ออกจากไฟล์นำเข้า?</h2><p className="mt-2 text-sm leading-6 text-slate-600">แถว {deleteRowState.row_number} · {String(deleteRowState.normalized_data.product_name || 'ไม่มีชื่อสินค้า')} · {String(deleteRowState.normalized_data.unit_name || 'ไม่มีหน่วย')}</p><p className="mt-2 text-xs text-amber-700">ระบบจะตรวจสอบการจัดกลุ่มและยอดสรุปใหม่ให้ทันที รายการนี้ยังไม่มีผลกับสต๊อกจนกว่าจะนำเข้าจริง</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeleteRowState(null)} className="h-10 border border-slate-300 px-4 text-sm">ยกเลิก</button><button type="button" onClick={() => void performDeleteRow()} className="h-10 bg-red-700 px-4 text-sm font-semibold text-white">ลบรายการ</button></div></div></div> : null}
  </main></CommerceShell>;
}

function PosvisPreview({ preview, rows, editable, editingCell, editValue, editError, onEditCell, onChange, onSave, onCancel, onToggleSell, onDeleteRow, deletingRowId, savingCell }: {
  preview: PosvisPreview;
  rows: Row[];
  editable: boolean;
  editingCell: EditingCell | null;
  editValue: string;
  editError: string;
  onEditCell: (row: Row, key: EditableKey) => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onToggleSell: (row: Row) => void;
  onDeleteRow: (row: Row) => void;
  deletingRowId: string | null;
  savingCell: string | null;
}) {
  const rowByNumber = new Map(rows.map((row) => [row.row_number, row]));
  const valueFor = (row: Row | undefined, key: EditableKey, fallback: unknown) => row?.normalized_data[key] ?? fallback;
  const isEditing = (row: Row | undefined, key: EditableKey) => Boolean(row && editingCell?.rowId === row.id && editingCell.key === key);
  const isSaving = (row: Row | undefined, key: EditableKey) => Boolean(row && savingCell === `${row.id}:${key}`);
  const inputValueFor = (row: Row, key: EditableKey, fallback: unknown) => isEditing(row, key) ? editValue : String(valueFor(row, key, fallback) ?? '');
  return <section className="border-b border-slate-200 bg-white">
    <div className="grid border-b border-slate-200 bg-primary-50 sm:grid-cols-4"><Summary label="สินค้าแม่" value={preview.products.length} /><Summary label="หน่วยขาย" value={preview.unitCount} /><Summary label="สต๊อกรวม" value={preview.stockTotal} /><Summary label="คำเตือน" value={preview.warningCount} danger={preview.warningCount > 0} /></div>
    <div className="border-b border-slate-200 px-3 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-700">ตัวอย่างการจัดกลุ่ม POSVis</p>{editable ? <p className="text-[11px] text-slate-500">คลิกค่าที่ต้องการแก้ · Enter หรือคลิกออกเพื่อบันทึก · Esc เพื่อยกเลิก</p> : null}</div>{editable ? <p className="mt-1 text-[11px] text-primary-800">ราคาและต้นทุนคำนวณสัมพันธ์ตามอัตราแปลงของหน่วยเดียวกันอัตโนมัติ เช่น 1 กก. ฿300 → 40 กก. ฿12,000</p> : null}{editError ? <p role="alert" className="mt-2 border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">{editError}</p> : null}{preview.warnings.length ? <div className="mt-2 space-y-1 text-xs text-amber-700">{preview.warnings.map((warning) => <p key={warning.code}>คำเตือน: {warning.message} · แถว {warning.rowNumbers.join(', ')}</p>)}</div> : <p className="mt-1 text-xs text-primary-800">ไม่พบคำเตือนในการอ่านสินค้าและหน่วย</p>}</div>
    <div className="w-full overflow-hidden"><table className="w-full table-fixed text-left text-[11px]"><colgroup><col className="w-[22%]" /><col className="w-[18%]" /><col className="w-[12%]" /><col className="w-[13%]" /><col className="w-[11%]" /><col className="w-[9%]" /><col className="w-[7%]" /><col className="w-[8%]" /></colgroup><thead className="bg-slate-50 text-slate-500"><tr><th className="break-words px-2 py-2">สินค้าแม่ / หมวด</th><th className="break-words px-2 py-2">หน่วย / Barcode</th><th className="break-words px-2 py-2 text-right">อัตราแปลง</th><th className="px-2 py-2 text-right">ราคา</th><th className="px-2 py-2 text-right">ต้นทุน</th><th className="px-2 py-2 text-right">คงเหลือ</th><th className="break-words px-2 py-2 text-center">ขาย</th><th className="break-words px-2 py-2 text-center">จัดการ</th></tr></thead><tbody>{preview.products.map((product) => product.units.map((unit, index) => {
      const row = rowByNumber.get(unit.rowNumber);
      const productName = String(valueFor(row, 'product_name', product.name));
      const categoryName = String(valueFor(row, 'category_name', product.categoryName));
      const unitName = String(valueFor(row, 'unit_name', unit.unitName));
      const barcode = String(valueFor(row, 'barcode', unit.barcode || '') || '');
      const conversion = String(valueFor(row, 'conversion_to_base', unit.conversionToBase));
      const salePrice = String(valueFor(row, 'sale_price', unit.salePrice));
      const costPrice = String(valueFor(row, 'cost_price', unit.costPrice));
      const stock = String(valueFor(row, 'stock', unit.stock));
      const canSell = booleanValue(valueFor(row, 'can_sell', unit.canSell));
      return <tr key={`${product.sku}-${unit.barcode || index}`} className="border-t border-slate-100 align-top hover:bg-slate-50/70"><td className="break-words px-2 py-2">{index === 0 ? <>{row ? <EditableCell value={inputValueFor(row, 'product_name', productName)} display={productName || 'ไม่มีชื่อสินค้า'} editing={isEditing(row, 'product_name')} inputType="text" disabled={!editable || isSaving(row, 'product_name')} onStart={() => onEditCell(row, 'product_name')} onChange={onChange} onSave={onSave} onCancel={onCancel} className="font-semibold text-slate-800" /> : <p className="font-semibold text-slate-800">{productName}</p>} {row ? <EditableCell value={inputValueFor(row, 'category_name', categoryName)} display={categoryName || 'ไม่มีหมวด'} editing={isEditing(row, 'category_name')} inputType="text" disabled={!editable || isSaving(row, 'category_name')} onStart={() => onEditCell(row, 'category_name')} onChange={onChange} onSave={onSave} onCancel={onCancel} className="mt-0.5 text-slate-500" /> : <p className="mt-0.5 break-words text-slate-500">{categoryName} · {product.sku}</p>}<span className="mt-0.5 block break-all font-mono text-[10px] text-slate-400">{product.sku}</span></> : <span className="text-slate-400">สินค้าเดิม</span>}</td><td className="break-words px-2 py-2">{row ? <EditableCell value={inputValueFor(row, 'unit_name', unitName)} display={unitName || 'ไม่มีหน่วย'} editing={isEditing(row, 'unit_name')} inputType="text" disabled={!editable || isSaving(row, 'unit_name')} onStart={() => onEditCell(row, 'unit_name')} onChange={onChange} onSave={onSave} onCancel={onCancel} className="font-medium text-slate-800" /> : <span className="font-medium">{unitName}</span>}{row ? <EditableCell value={inputValueFor(row, 'barcode', barcode)} display={<span className="break-all font-mono text-[10px] text-slate-400">{barcode || 'ไม่มี barcode'}</span>} editing={isEditing(row, 'barcode')} inputType="text" disabled={!editable || isSaving(row, 'barcode')} onStart={() => onEditCell(row, 'barcode')} onChange={onChange} onSave={onSave} onCancel={onCancel} className="font-mono text-[10px] text-slate-400" /> : <span className="block break-all font-mono text-[10px] text-slate-400">{barcode || 'ไม่มี barcode'}</span>}</td><td className="px-2 py-2 text-right tabular-nums">{row ? <EditableCell value={inputValueFor(row, 'conversion_to_base', conversion)} display={`1 = ${conversion} kg`} editing={isEditing(row, 'conversion_to_base')} inputType="number" disabled={!editable || isSaving(row, 'conversion_to_base')} onStart={() => onEditCell(row, 'conversion_to_base')} onChange={onChange} onSave={onSave} onCancel={onCancel} className="text-right text-slate-700" /> : `1 = ${conversion} kg`}</td><td className="px-2 py-2 text-right tabular-nums">{row ? <EditableCell value={inputValueFor(row, 'sale_price', salePrice)} display={`฿${Number(salePrice || 0).toLocaleString('th-TH')}`} editing={isEditing(row, 'sale_price')} inputType="number" disabled={!editable || isSaving(row, 'sale_price')} onStart={() => onEditCell(row, 'sale_price')} onChange={onChange} onSave={onSave} onCancel={onCancel} className="text-right text-slate-800" /> : `฿${unit.salePrice.toLocaleString('th-TH')}`}</td><td className="px-2 py-2 text-right tabular-nums">{row ? <EditableCell value={inputValueFor(row, 'cost_price', costPrice)} display={`฿${Number(costPrice || 0).toLocaleString('th-TH')}`} editing={isEditing(row, 'cost_price')} inputType="number" disabled={!editable || isSaving(row, 'cost_price')} onStart={() => onEditCell(row, 'cost_price')} onChange={onChange} onSave={onSave} onCancel={onCancel} className="text-right text-slate-800" /> : `฿${unit.costPrice.toLocaleString('th-TH')}`}</td><td className="px-2 py-2 text-right tabular-nums">{row ? <EditableCell value={inputValueFor(row, 'stock', stock)} display={Number(stock || 0).toLocaleString('th-TH')} editing={isEditing(row, 'stock')} inputType="number" disabled={!editable || isSaving(row, 'stock')} onStart={() => onEditCell(row, 'stock')} onChange={onChange} onSave={onSave} onCancel={onCancel} className="text-right text-slate-800" /> : unit.stock.toLocaleString('th-TH')}</td><td className="px-2 py-2 text-center font-semibold">{editable && row ? <button type="button" disabled={isSaving(row, 'can_sell')} onClick={() => onToggleSell(row)} className={`${canSell ? 'text-primary-800' : 'text-slate-400'} cursor-pointer underline-offset-2 hover:underline disabled:cursor-default`} title="คลิกเพื่อเปลี่ยนสถานะการขาย">{canSell ? 'เปิดขาย' : 'ปิดขาย'}</button> : <span className={canSell ? 'text-primary-800' : 'text-slate-400'}>{canSell ? 'เปิดขาย' : 'ปิดขาย'}</span>}</td><td className="px-2 py-2 text-center">{editable && row ? <button type="button" disabled={deletingRowId === row.id} onClick={() => onDeleteRow(row)} className="border border-red-200 px-1.5 py-1 text-[10px] font-medium text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-50" aria-label={`ลบรายการแถว ${row.row_number}`}>{deletingRowId === row.id ? 'กำลังลบ…' : 'ลบ'}</button> : <span className="text-slate-300">—</span>}</td></tr>;
    }))}</tbody></table></div>
  </section>;
}

function EditableCell({ value, display, editing, inputType, disabled, onStart, onChange, onSave, onCancel, className = '' }: { value: string; display: ReactNode; editing: boolean; inputType: 'text' | 'number'; disabled: boolean; onStart: () => void; onChange: (value: string) => void; onSave: () => void; onCancel: () => void; className?: string }) {
  const skipBlurSave = useRef(false);
  useEffect(() => { skipBlurSave.current = false; }, [editing]);
  if (editing) return <input data-inline-editor autoFocus value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); onSave(); } if (event.key === 'Escape') { event.preventDefault(); skipBlurSave.current = true; onCancel(); } }} onBlur={() => { if (!skipBlurSave.current) onSave(); }} type={inputType} step={inputType === 'number' ? '0.001' : undefined} className={`h-7 w-full min-w-0 border border-primary-600 bg-white px-1.5 outline-none ring-2 ring-primary-100 ${inputType === 'number' ? 'text-right tabular-nums' : ''} ${className}`} disabled={disabled} />;
  return <button type="button" onClick={onStart} disabled={disabled} className={`block w-full min-w-0 cursor-text break-words text-left underline-offset-2 hover:text-primary-800 hover:underline disabled:cursor-default disabled:no-underline ${className}`}>{display}</button>;
}

function Summary({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) { return <div className="border-r border-slate-200 px-4 py-3"><dt className="text-[11px] text-slate-500">{label}</dt><dd className={`mt-1 text-lg font-semibold tabular-nums ${danger ? 'text-red-700' : 'text-slate-900'}`}>{value.toLocaleString('th-TH')}</dd></div>; }
