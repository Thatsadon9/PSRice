'use client';
/* eslint-disable @next/next/no-img-element */

import Select from '@/components/ui/Select';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, CheckCircle2, ChevronLeft, ChevronRight, Eye, FileClock, Info, PackageCheck, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { CommerceShell } from '@/components/commerce/CommerceShell';
import { CommerceInitialState } from '@/components/commerce/CommerceInitialState';
import CommerceProductPicker from '@/components/commerce/CommerceProductPicker';
import CommerceUnitPicker from '@/components/commerce/CommerceUnitPicker';
import CommerceConfirmDialog from '@/components/commerce/CommerceConfirmDialog';
import { CommerceBootstrap, formatBaht, toNumber } from '@/lib/commerce';
import { getAccessToken } from '@/lib/supabase';

type PoItem = { id: string; product_id: string; product_unit_id: string; quantity_ordered: number | string; quantity_received: number | string; unit_cost: number | string };
type Po = { id: string; purchase_order_number: string; supplier_id: string; document_date: string; grand_total: number | string; suppliers: { name: string } | null; purchase_order_items: PoItem[] };
type Supplier = { id: string; code: string | null; name: string };
type LatestCost = { product_id: string; product_unit_id: string; unit_cost: number; received_at: string };
type HistoryItem = { id: string; purchase_order_item_id?: string | null; product_id: string; product_unit_id: string; quantity: number | string; unit_cost: number | string; product_name: string; sku: string | null; barcode: string | null; category_name: string | null; unit_name: string; unit_code: string; conversion_to_base: number; image_url: string | null };
type HistoryRow = { id: string; documentType: 'draft' | 'receipt'; documentNumber: string; status: 'draft' | 'completed'; source: 'po' | 'direct'; branchId: string; purchaseOrderId: string | null; purchaseOrderNumber: string | null; supplierId: string | null; supplierName: string | null; receivedAt: string; updatedAt: string; itemCount: number; totalQuantity: number; totalAmount: number; items: HistoryItem[]; note: string | null; paymentMethod: string | null };
type ReceiptDetail = HistoryRow;
type Line = { key: string; product_id: string; product_unit_id: string; quantity: number; unit_cost: number; po_item_id?: string };
type Filters = { q: string; from: string; to: string; status: 'all' | 'draft' | 'completed'; source: 'all' | 'po' | 'direct' };
type CostSource = 'latest' | 'branch' | 'default' | 'manual' | null;

async function api(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'ทำรายการไม่สำเร็จ');
  return body;
}

function dateTimeNow() {
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); return now.toISOString().slice(0, 16);
}
function localDateTime(value: string) {
  const date = new Date(value); if (Number.isNaN(date.getTime())) return dateTimeNow(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16);
}
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }); }
function inputNumber(value: number, decimals = 2) { return String(Number(value.toFixed(decimals))); }

export default function GoodsReceiptWorkspace() {
  const [bootstrap, setBootstrap] = useState<CommerceBootstrap | null>(null);
  const [orders, setOrders] = useState<Po[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [latestCosts, setLatestCosts] = useState<LatestCost[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [filters, setFilters] = useState<Filters>({ q: '', from: '', to: '', status: 'all', source: 'all' });
  const [status, setStatus] = useState('กำลังโหลดใบนำเข้าสินค้า…');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [draftId, setDraftId] = useState('');
  const [poId, setPoId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [receivedAt, setReceivedAt] = useState(dateTimeNow);
  const [payment, setPayment] = useState('cash');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [productId, setProductId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [cost, setCost] = useState('');
  const [costSource, setCostSource] = useState<CostSource>(null);
  const [lineFormError, setLineFormError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [detail, setDetail] = useState<ReceiptDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmKind, setConfirmKind] = useState<'finalize' | 'close' | 'delete' | null>(null);
  const [deleteId, setDeleteId] = useState('');

  const products = useMemo(() => new Map((bootstrap?.products || []).map((item) => [item.id, item])), [bootstrap?.products]);
  const latestCostByUnit = useMemo(() => new Map(latestCosts.map((item) => [`${item.product_id}:${item.product_unit_id}`, item])), [latestCosts]);
  const product = products.get(productId);
  const selectedUnit = product?.units.find((item) => item.id === unitId);
  const po = orders.find((item) => item.id === poId);
  const totals = lines.reduce((sum, line) => ({ quantity: sum.quantity + line.quantity, total: sum.total + line.quantity * line.unit_cost }), { quantity: 0, total: 0 });
  const productName = (id: string) => products.get(id)?.name || 'สินค้า';
  const unitName = (pid: string, uid: string) => products.get(pid)?.units.find((item) => item.id === uid)?.name || '-';
  const productImage = (pid: string, uid: string) => products.get(pid)?.units.find((item) => item.id === uid)?.imageUrl || products.get(pid)?.imageUrl || null;

  const loadHistory = useCallback(async (branchId: string, nextFilters: Filters = filters, page = pagination.page) => {
    const params = new URLSearchParams({ branch_id: branchId, page: String(page), page_size: '20', q: nextFilters.q, from: nextFilters.from, to: nextFilters.to, status: nextFilters.status, source: nextFilters.source });
    const data = await api(`/api/commerce/purchasing/receive?${params.toString()}`) as { history: HistoryRow[]; pagination: typeof pagination; purchaseOrders: Po[]; suppliers: Supplier[]; latestCosts: LatestCost[] };
    setHistory(data.history || []); setPagination(data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 1 }); setOrders(data.purchaseOrders || []); setSuppliers(data.suppliers || []); setLatestCosts(data.latestCosts || []); setError(''); setStatus('ข้อมูลล่าสุดแล้ว');
  }, [filters, pagination.page]);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(''); setStatus('กำลังโหลดใบนำเข้าสินค้า…');
      const base = await api('/api/commerce/bootstrap') as CommerceBootstrap;
      setBootstrap(base);
      await loadHistory(base.branchId, filters, 1);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'ไม่สามารถโหลดใบนำเข้าสินค้าได้'; setError(message); setStatus(message);
    } finally { setLoading(false); }
  }, [filters, loadHistory]);

  // Keep bootstrap loading separate from filter refreshes below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!bootstrap) return;
    const timer = window.setTimeout(() => { void loadHistory(bootstrap.branchId, filters, 1).catch((loadError) => { const message = loadError instanceof Error ? loadError.message : 'โหลดประวัติไม่สำเร็จ'; setError(message); setStatus(message); }); }, 240);
    return () => window.clearTimeout(timer);
  }, [bootstrap, filters, loadHistory]);

  const suggestedCost = (pid: string, uid: string) => {
    const selectedProduct = products.get(pid); const selectedProductUnit = selectedProduct?.units.find((item) => item.id === uid); if (!selectedProduct || !selectedProductUnit) return null;
    const latest = latestCostByUnit.get(`${pid}:${uid}`); if (latest) return { value: latest.unit_cost, source: 'latest' as const };
    if (typeof selectedProductUnit.costPrice === 'number') return { value: selectedProductUnit.costPrice, source: 'branch' as const };
    if (selectedProduct.defaultCostPrice > 0) return { value: selectedProduct.defaultCostPrice * Math.max(0.001, selectedProductUnit.conversionToBase), source: 'default' as const };
    return null;
  };
  const applySuggestedCost = (pid: string, uid: string) => { const suggestion = suggestedCost(pid, uid); if (!suggestion) { setCost(''); setCostSource(null); } else { setCost(inputNumber(suggestion.value)); setCostSource(suggestion.source); } };
  const touch = () => setDirty(true);

  const selectPo = (id: string, markDirty = true) => {
    setPoId(id); setSupplierId(''); setProductId(''); setUnitId(''); setCost(''); setCostSource(null); setLineFormError('');
    const selected = orders.find((item) => item.id === id);
    setLines((selected?.purchase_order_items || []).map((item) => ({ key: item.id, po_item_id: item.id, product_id: item.product_id, product_unit_id: item.product_unit_id, quantity: Math.max(0, toNumber(item.quantity_ordered) - toNumber(item.quantity_received)), unit_cost: toNumber(item.unit_cost) })).filter((item) => item.quantity > 0));
    if (markDirty) touch();
  };

  const resetEditor = () => { setDraftId(''); setPoId(''); setSupplierId(''); setReceivedAt(dateTimeNow()); setPayment('cash'); setNote(''); setLines([]); setProductId(''); setUnitId(''); setQuantity('1'); setCost(''); setCostSource(null); setLineFormError(''); setDirty(false); };
  const openEditor = (poStart = '') => { resetEditor(); setOpen(true); if (poStart) selectPo(poStart, false); };

  const editDraft = async (row: HistoryRow) => {
    try {
      setEditorLoading(true); setOpen(true); resetEditor();
      const data = await api(`/api/commerce/purchasing/receive?branch_id=${encodeURIComponent(row.branchId)}&id=${encodeURIComponent(row.id)}&type=draft`) as { detail: ReceiptDetail };
      const value = data.detail; setDraftId(value.id); setPoId(value.purchaseOrderId || ''); setSupplierId(value.supplierId || ''); setReceivedAt(localDateTime(value.receivedAt)); setPayment(value.paymentMethod || 'cash'); setNote(value.note || '');
      setLines(value.items.map((item) => ({ key: item.id, po_item_id: item.purchase_order_item_id || undefined, product_id: item.product_id, product_unit_id: item.product_unit_id, quantity: toNumber(item.quantity), unit_cost: toNumber(item.unit_cost) }))); setDirty(false);
    } catch (editError) { setStatus(editError instanceof Error ? editError.message : 'เปิดใบพักไม่สำเร็จ'); setOpen(false); } finally { setEditorLoading(false); }
  };

  const openDetail = async (row: HistoryRow) => {
    try { setDetailLoading(true); setDetailOpen(true); const data = await api(`/api/commerce/purchasing/receive?branch_id=${encodeURIComponent(row.branchId)}&id=${encodeURIComponent(row.id)}&type=${row.documentType}`) as { detail: ReceiptDetail }; setDetail(data.detail); }
    catch (detailError) { setStatus(detailError instanceof Error ? detailError.message : 'เปิดรายละเอียดไม่สำเร็จ'); setDetailOpen(false); } finally { setDetailLoading(false); }
  };

  const selectProduct = (id: string) => { const next = products.get(id); const nextUnitId = next?.units.find((item) => item.isDefault && item.canReceive)?.id || next?.units.find((item) => item.canReceive)?.id || ''; setProductId(id); setUnitId(nextUnitId); setLineFormError(''); touch(); if (nextUnitId) applySuggestedCost(id, nextUnitId); else { setCost(''); setCostSource(null); } };
  const selectUnit = (id: string) => { setUnitId(id); setLineFormError(''); touch(); const suggestion = suggestedCost(productId, id); if (suggestion) { setCost(inputNumber(suggestion.value)); setCostSource(suggestion.source); } else if (costSource !== 'manual') { setCost(''); setCostSource(null); } };
  const addLine = () => {
    if (!productId) return setLineFormError('เลือกสินค้าที่ต้องการรับเข้าก่อน');
    if (!unitId) return setLineFormError('เลือกหน่วยรับของสินค้าก่อน');
    if (!quantity.trim() || toNumber(quantity) <= 0) return setLineFormError('กรอกจำนวนรับให้มากกว่า 0');
    if (!cost.trim() || toNumber(cost) < 0) return setLineFormError('กรอกต้นทุนต่อหน่วยที่จ่ายจริง');
    setLines((current) => [...current, { key: crypto.randomUUID(), product_id: productId, product_unit_id: unitId, quantity: toNumber(quantity), unit_cost: toNumber(cost) }]); setProductId(''); setUnitId(''); setQuantity('1'); setCost(''); setCostSource(null); setLineFormError(''); touch();
  };

  const validateForm = () => { if (!bootstrap || !lines.length) { setStatus('เพิ่มรายการสินค้าอย่างน้อยหนึ่งรายการ'); return false; } if (!po && !supplierId) { setStatus('เลือกผู้ขายคู่ค้า'); return false; } if (lines.some((line) => line.quantity <= 0 || line.unit_cost < 0)) { setStatus('ตรวจสอบจำนวนและต้นทุนของรายการ'); return false; } return true; };
  const saveDraftInternal = async () => {
    if (!bootstrap || !validateForm()) throw new Error('ตรวจสอบข้อมูลใบนำเข้า');
    const items = po ? lines.map((line) => ({ purchase_order_item_id: line.po_item_id, product_id: line.product_id, product_unit_id: line.product_unit_id, quantity: line.quantity, unit_cost: line.unit_cost })) : lines.map(({ product_id, product_unit_id, quantity: qty, unit_cost }) => ({ product_id, product_unit_id, quantity: qty, unit_cost }));
    const data = await api('/api/commerce/purchasing/receive', { method: 'POST', body: JSON.stringify({ action: 'save_draft', branch_id: bootstrap.branchId, draft_id: draftId || undefined, purchase_order_id: po?.id || undefined, supplier_id: po?.supplier_id || supplierId || undefined, received_at: new Date(receivedAt).toISOString(), payment_method: payment, items, note }) }) as { result: { draft_id: string; draft_number: string } };
    setDraftId(data.result.draft_id); setDirty(false); return data.result;
  };
  const saveDraft = async () => { try { setWorking(true); const result = await saveDraftInternal(); setOpen(false); await loadHistory(bootstrap?.branchId || '', filters, 1); setStatus(`เก็บ ${result.draft_number} ไว้แล้ว แก้ไขต่อได้จากประวัติ`); } catch (saveError) { setStatus(saveError instanceof Error ? saveError.message : 'พักใบนำเข้าไม่สำเร็จ'); } finally { setWorking(false); } };
  const requestFinalize = () => { if (validateForm()) setConfirmKind('finalize'); };
  const finalize = async () => {
    try {
      setWorking(true); setConfirmKind(null); const saved = await saveDraftInternal();
      const result = await api('/api/commerce/purchasing/receive', { method: 'POST', body: JSON.stringify({ action: 'finalize_draft', branch_id: bootstrap?.branchId, draft_id: saved.draft_id }) }) as { result: { goods_receipt_number: string } };
      setOpen(false); await loadHistory(bootstrap?.branchId || '', filters, 1); setStatus(`ยืนยัน ${result.result.goods_receipt_number} แล้ว สต๊อกเพิ่มเรียบร้อย`);
    } catch (finalizeError) { setStatus(finalizeError instanceof Error ? finalizeError.message : 'ยืนยันใบนำเข้าไม่สำเร็จ'); } finally { setWorking(false); }
  };
  const requestClose = () => { if (working) return; if (dirty) setConfirmKind('close'); else setOpen(false); };
  const discardClose = () => { setConfirmKind(null); setOpen(false); resetEditor(); };
  const requestDelete = (row: HistoryRow) => { setDeleteId(row.id); setConfirmKind('delete'); };
  const deleteDraft = async () => { try { setWorking(true); setConfirmKind(null); await api('/api/commerce/purchasing/receive', { method: 'POST', body: JSON.stringify({ action: 'delete_draft', branch_id: bootstrap?.branchId, draft_id: deleteId }) }); setDetailOpen(false); await loadHistory(bootstrap?.branchId || '', filters, 1); setStatus('ลบใบนำเข้าแบบพักไว้แล้ว โดยไม่มีผลต่อสต๊อก'); } catch (deleteError) { setStatus(deleteError instanceof Error ? deleteError.message : 'ลบใบนำเข้าไม่สำเร็จ'); } finally { setWorking(false); } };

  if (loading && !bootstrap) return <CommerceShell section="goods-receipts"><main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6"><CommerceInitialState status={status} onRetry={() => void load()} label="กำลังโหลดประวัติใบนำเข้า…" /></main></CommerceShell>;
  if (!bootstrap) return <CommerceShell section="goods-receipts"><main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6"><CommerceInitialState status={error || status} onRetry={() => void load()} /></main></CommerceShell>;

  return <CommerceShell section="goods-receipts">
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold text-primary-800">บริหารสต๊อก</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">ใบนำเข้าสินค้า</h1><p className="mt-1 text-sm text-slate-500">สร้างใบรับเข้า พักไว้แก้ไขภายหลัง และตรวจสอบประวัติได้ในที่เดียว</p></div>
        <button type="button" onClick={() => openEditor()} className="inline-flex h-10 items-center justify-center gap-2 bg-primary-800 px-4 text-sm font-semibold text-white hover:bg-primary-900"><ArrowDownToLine className="h-4 w-4" />สร้างใบนำเข้าสินค้า</button>
      </header>

      <section className="mt-5 border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="ค้นหาเลขที่เอกสาร, PO, ผู้ขาย, ชื่อสินค้า, SKU หรือบาร์โค้ด" className="h-10 w-full border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-primary-700" /></label>
          <div className="grid grid-cols-2 gap-2 lg:flex"><label className="sr-only" htmlFor="receipt-from">วันที่เริ่มต้น</label><input id="receipt-from" type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="h-10 border border-slate-300 px-2 text-sm" /><label className="sr-only" htmlFor="receipt-to">วันที่สิ้นสุด</label><input id="receipt-to" type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="h-10 border border-slate-300 px-2 text-sm" /></div>
          <Select value={filters.status} onValueChange={(value) => setFilters((current) => ({ ...current, status: value as Filters['status'] }))} options={[{ value: 'all', label: 'ทุกสถานะ' }, { value: 'draft', label: 'พักบิล' }, { value: 'completed', label: 'ยืนยันแล้ว' }]} shape="square" className="h-10 min-w-36" aria-label="กรองสถานะ" />
          <Select value={filters.source} onValueChange={(value) => setFilters((current) => ({ ...current, source: value as Filters['source'] }))} options={[{ value: 'all', label: 'ทุกแหล่งที่มา' }, { value: 'po', label: 'จาก PO' }, { value: 'direct', label: 'รับเข้าโดยตรง' }]} shape="square" className="h-10 min-w-36" aria-label="กรองแหล่งที่มา" />
          <button type="button" onClick={() => setFilters({ q: '', from: '', to: '', status: 'all', source: 'all' })} className="h-10 whitespace-nowrap border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50">ล้างตัวกรอง</button>
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2 text-xs text-slate-500"><span>{status}</span><button type="button" onClick={() => void loadHistory(bootstrap.branchId, filters, pagination.page)} className="inline-flex items-center gap-1.5 text-primary-800 hover:underline"><RefreshCw className="h-3.5 w-3.5" />รีเฟรช</button></div>
        {error ? <div role="alert" className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><span>{error}</span><button type="button" onClick={() => void loadHistory(bootstrap.branchId, filters, pagination.page).catch((loadError) => setStatus(loadError instanceof Error ? loadError.message : 'โหลดประวัติไม่สำเร็จ'))} className="shrink-0 font-semibold underline">ลองใหม่</button></div> : null}
        <div className="max-h-[62dvh] overflow-auto">
          <table className="w-full min-w-[980px] text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3">เลขที่เอกสาร</th><th className="px-4 py-3">วันที่รับเข้า / แก้ไขล่าสุด</th><th className="px-4 py-3">ผู้ขาย / PO</th><th className="px-4 py-3 text-right">รายการ</th><th className="px-4 py-3 text-right">มูลค่ารวม</th><th className="px-4 py-3 text-right">คำสั่ง</th></tr></thead>
            <tbody>{history.map((row) => <tr key={`${row.documentType}-${row.id}`} className="border-t border-slate-100 align-middle hover:bg-slate-50/70">
              <td className="px-4 py-3">{row.status === 'draft' ? <span className="inline-flex items-center gap-1.5 text-amber-800"><FileClock className="h-4 w-4" />พักไว้</span> : <span className="inline-flex items-center gap-1.5 text-emerald-800"><CheckCircle2 className="h-4 w-4" />ยืนยันแล้ว</span>}</td>
              <td className="px-4 py-3"><button type="button" onClick={() => void openDetail(row)} className="font-semibold text-slate-900 hover:text-primary-800 hover:underline">{row.documentNumber}</button><p className="mt-0.5 text-xs text-slate-500">{row.source === 'po' ? 'รับจาก PO' : 'รับเข้าโดยตรง'}</p></td>
              <td className="px-4 py-3 text-slate-600">{formatDate(row.status === 'draft' ? row.updatedAt : row.receivedAt)}{row.status === 'draft' ? <span className="mt-0.5 block text-xs text-amber-700">ยังไม่เพิ่มสต๊อก</span> : null}</td>
              <td className="px-4 py-3"><div className="font-medium">{row.supplierName || '-'}</div><div className="text-xs text-primary-800">{row.purchaseOrderNumber || 'ไม่อ้างอิง PO'}</div></td>
              <td className="px-4 py-3 text-right">{row.itemCount.toLocaleString('th-TH')} รายการ<span className="mt-0.5 block text-xs text-slate-500">{row.totalQuantity.toLocaleString('th-TH')} หน่วย</span></td>
              <td className="px-4 py-3 text-right font-semibold">{formatBaht(row.totalAmount)}</td>
              <td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" onClick={() => void openDetail(row)} className="inline-flex h-8 items-center gap-1 border border-slate-300 px-2.5 text-xs text-slate-700 hover:bg-white"><Eye className="h-3.5 w-3.5" />ดู</button>{row.status === 'draft' ? <><button type="button" onClick={() => void editDraft(row)} className="h-8 border border-primary-700 px-2.5 text-xs font-semibold text-primary-800 hover:bg-primary-50">แก้ไขต่อ</button><button type="button" onClick={() => requestDelete(row)} className="grid h-8 w-8 place-items-center border border-red-200 text-red-700 hover:bg-red-50" aria-label={`ลบ ${row.documentNumber}`}><Trash2 className="h-3.5 w-3.5" /></button></> : null}</div></td>
            </tr>)}{!history.length ? <tr><td colSpan={7} className="px-4 py-16 text-center"><PackageCheck className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-700">{filters.q || filters.status !== 'all' || filters.source !== 'all' || filters.from || filters.to ? 'ไม่พบรายการตามตัวกรอง' : 'ยังไม่มีประวัติใบนำเข้าสินค้า'}</p><p className="mt-1 text-xs text-slate-500">สร้างใบใหม่แล้วเลือกพักบิลหรือยืนยันเพื่อเพิ่มสต๊อก</p></td></tr> : null}</tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500"><span>แสดง {history.length.toLocaleString('th-TH')} จาก {pagination.total.toLocaleString('th-TH')} รายการ</span><div className="flex items-center gap-2"><button type="button" disabled={pagination.page <= 1} onClick={() => void loadHistory(bootstrap.branchId, filters, pagination.page - 1)} className="grid h-8 w-8 place-items-center border border-slate-300 disabled:opacity-40" aria-label="หน้าก่อนหน้า"><ChevronLeft className="h-4 w-4" /></button><span>{pagination.page}/{pagination.totalPages}</span><button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => void loadHistory(bootstrap.branchId, filters, pagination.page + 1)} className="grid h-8 w-8 place-items-center border border-slate-300 disabled:opacity-40" aria-label="หน้าถัดไป"><ChevronRight className="h-4 w-4" /></button></div></div>
      </section>
    </main>

    {orders.length ? <div className="fixed bottom-4 left-4 z-20 hidden border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 shadow-sm lg:block">มีใบสั่งซื้อรอนำเข้า {orders.length} ใบ · <button type="button" onClick={() => openEditor(orders[0].id)} className="font-semibold underline">เริ่มจาก {orders[0].purchase_order_number}</button></div> : null}

    {open ? <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35"><button type="button" className="absolute inset-0" aria-label="ปิด" onClick={requestClose} /><section role="dialog" aria-modal="true" className="relative flex h-dvh w-full max-w-5xl flex-col bg-[#f8f9f8] shadow-2xl">
      <header className="flex min-h-16 items-center border-b border-slate-200 bg-white px-4"><div><h2 className="font-semibold">{draftId ? 'แก้ไขใบนำเข้าที่พักไว้' : 'สร้างใบนำเข้าสินค้า'}</h2><p className="text-xs text-slate-500">{draftId ? 'ตรวจสอบข้อมูลแล้วพักต่อหรือยืนยันเพื่อเพิ่มสต๊อก' : 'ยังไม่เพิ่มสต๊อกจนกว่าจะยืนยันนำเข้า'}</p></div><button type="button" onClick={requestClose} className="ml-auto grid h-9 w-9 place-items-center text-slate-500 hover:bg-slate-50" aria-label="ปิด"><X className="h-5 w-5" /></button></header>
      {editorLoading ? <div className="grid flex-1 place-items-center text-sm text-slate-500">กำลังโหลดใบนำเข้า…</div> : <><div className="min-h-0 flex-1 overflow-y-auto p-4">
        <section className="grid gap-3 border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"><label className="block text-sm font-medium" htmlFor="receipt-date">วันที่รับเข้า <span className="text-red-600">*</span><input id="receipt-date" type="datetime-local" value={receivedAt} onChange={(event) => { setReceivedAt(event.target.value); touch(); }} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-sm" /></label><label className="block text-sm font-medium" htmlFor="receipt-po">เลข PO อ้างอิง <span className="text-xs font-normal text-slate-500">(ไม่บังคับ)</span><Select id="receipt-po" value={poId} onValueChange={(value) => selectPo(value)} options={[{ value: '', label: 'ไม่อ้างอิง PO' }, ...orders.map((item) => ({ value: item.id, label: `${item.purchase_order_number} — ${item.suppliers?.name || 'ไม่ระบุผู้ขาย'}` }))]} shape="square" className="mt-1.5 h-10 w-full" /></label>{po ? <div className="border border-primary-100 bg-primary-50 px-3 py-2.5 text-sm text-primary-950"><span className="block text-xs text-primary-700">ผู้ขาย / อ้างอิง</span><strong>{po.suppliers?.name || '-'}</strong><span className="mx-1 text-primary-500">·</span>{po.purchase_order_number}</div> : <label className="block text-sm font-medium" htmlFor="receipt-supplier">ซื้อมาจาก <span className="text-red-600">*</span><Select id="receipt-supplier" value={supplierId} onValueChange={(value) => { setSupplierId(value); touch(); }} options={[{ value: '', label: 'เลือกผู้ขายคู่ค้า' }, ...suppliers.map((item) => ({ value: item.id, label: item.code ? `${item.code} — ${item.name}` : item.name }))]} shape="square" className="mt-1.5 h-10 w-full" /></label>}{!po ? <label className="block text-sm font-medium" htmlFor="receipt-payment">การชำระเงิน <span className="text-red-600">*</span><Select id="receipt-payment" value={payment} onValueChange={(value) => { setPayment(value); touch(); }} options={[{ value: 'cash', label: 'เงินสด' }, { value: 'transfer', label: 'โอนเงิน' }, { value: 'credit', label: 'เครดิต' }, { value: 'other', label: 'อื่น ๆ' }]} shape="square" className="mt-1.5 h-10 w-full" /></label> : null}<label className="block text-sm font-medium sm:col-span-2 lg:col-span-2" htmlFor="receipt-note">หมายเหตุ<textarea id="receipt-note" value={note} onChange={(event) => { setNote(event.target.value); touch(); }} rows={1} placeholder="เลขใบส่งของ หรือรายละเอียดการรับสินค้า" className="mt-1.5 h-10 w-full resize-none border border-slate-300 bg-white px-3 py-2 text-sm" /></label></section>
        {!po ? <section className="mt-4 overflow-hidden border border-slate-200 bg-white"><div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3"><h3 className="text-sm font-semibold">เพิ่มรายการรับเข้า</h3><p className="mt-0.5 text-xs text-slate-500">เลือกสินค้าและหน่วยจริง แล้วกรอกจำนวนกับต้นทุนที่จ่ายต่อหน่วย</p></div><div className="p-3"><div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,.8fr)]"><div><label className="text-xs font-semibold text-slate-700" htmlFor="receipt-product">สินค้า <span className="text-red-600">*</span></label><CommerceProductPicker id="receipt-product" value={productId} products={bootstrap.products} onValueChange={selectProduct} placeholder="เลือกสินค้าที่จะรับเข้า" aria-label="สินค้า" className="mt-1.5 h-11 w-full" /></div><div><label className="text-xs font-semibold text-slate-700" htmlFor="receipt-unit">หน่วยรับ <span className="text-red-600">*</span></label><CommerceUnitPicker id="receipt-unit" value={unitId} units={product?.units.filter((item) => item.canReceive) || []} product={product} onValueChange={selectUnit} disabled={!product} aria-label="หน่วยรับ" placeholder={product ? 'เลือกหน่วยรับ' : 'เลือกสินค้าก่อน'} className="mt-1.5 h-11 w-full" /></div></div><div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end"><div><label className="text-xs font-semibold text-slate-700" htmlFor="receipt-quantity">จำนวนรับ <span className="text-red-600">*</span></label><div className="relative mt-1.5"><input id="receipt-quantity" type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => { setQuantity(event.target.value); setLineFormError(''); touch(); }} placeholder="เช่น 10" className="h-11 w-full border border-slate-300 bg-white px-3 pr-16 text-right text-sm outline-none focus:border-primary-700" /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">{selectedUnit?.name || 'หน่วย'}</span></div></div><div><label className="text-xs font-semibold text-slate-700" htmlFor="receipt-cost">ต้นทุนต่อหน่วย <span className="text-red-600">*</span></label><div className="relative mt-1.5"><input id="receipt-cost" type="number" min="0" step="0.01" value={cost} onChange={(event) => { setCost(event.target.value); setCostSource('manual'); setLineFormError(''); touch(); }} placeholder="เช่น 125.00" className="h-11 w-full border border-slate-300 bg-white px-3 pr-14 text-right text-sm outline-none focus:border-primary-700" /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">บาท</span></div></div><button type="button" onClick={addLine} disabled={!product || !unitId || !quantity.trim() || toNumber(quantity) <= 0 || !cost.trim() || toNumber(cost) < 0} className="inline-flex h-11 items-center justify-center gap-1.5 border border-primary-800 px-5 text-sm font-semibold text-primary-800 hover:bg-primary-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"><Plus className="h-4 w-4" />เพิ่มรายการ</button></div><div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs"><span className="inline-flex items-center gap-1.5 text-slate-500"><Info className="h-3.5 w-3.5" />{costSource === 'latest' ? 'ต้นทุนล่าสุด · แก้ไขได้' : costSource === 'branch' ? 'ต้นทุนประจำหน่วยของสาขา · แก้ไขได้' : costSource === 'default' ? 'ต้นทุนมาตรฐาน · แก้ไขได้' : 'กรอกต้นทุนต่อหน่วย'}</span><span className="font-medium text-slate-700">รวมรายการ {formatBaht(toNumber(quantity) * toNumber(cost))}</span></div>{lineFormError ? <p role="alert" className="mt-3 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{lineFormError}</p> : null}</div></section> : null}
        <section className="mt-4 overflow-x-auto border border-slate-200 bg-white"><table className="w-full min-w-[680px] text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2.5">สินค้า</th><th className="px-3 py-2.5">หน่วย</th><th className="px-3 py-2.5 text-right">จำนวนรับ</th><th className="px-3 py-2.5 text-right">ต้นทุน/หน่วย</th><th className="px-3 py-2.5 text-right">รวม</th><th className="w-10" /></tr></thead><tbody>{lines.map((line) => <tr key={line.key} className="border-t border-slate-100"><td className="px-3 py-3 font-medium"><span className="flex items-center gap-2"><span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden border border-slate-200 bg-slate-50">{productImage(line.product_id, line.product_unit_id) ? <img src={productImage(line.product_id, line.product_unit_id) || undefined} alt="" className="h-full w-full object-cover" /> : <PackageCheck className="h-4 w-4 text-primary-800" />}</span><span className="min-w-0 truncate">{productName(line.product_id)}</span></span></td><td className="px-3 py-3">{unitName(line.product_id, line.product_unit_id)}</td><td className="px-3 py-3"><input aria-label={`จำนวนรับ ${productName(line.product_id)}`} type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => { setLines((current) => current.map((item) => item.key === line.key ? { ...item, quantity: toNumber(event.target.value) } : item)); touch(); }} className="ml-auto block h-8 w-24 border border-slate-300 px-2 text-right" /></td><td className="px-3 py-3"><input aria-label={`ต้นทุนต่อหน่วย ${productName(line.product_id)}`} type="number" min="0" step="0.01" value={line.unit_cost} onChange={(event) => { setLines((current) => current.map((item) => item.key === line.key ? { ...item, unit_cost: toNumber(event.target.value) } : item)); touch(); }} className="ml-auto block h-8 w-28 border border-slate-300 px-2 text-right" /></td><td className="px-3 py-3 text-right font-medium">{formatBaht(line.quantity * line.unit_cost)}</td><td><button type="button" onClick={() => { setLines((current) => current.filter((item) => item.key !== line.key)); touch(); }} className="grid h-8 w-8 place-items-center text-slate-400 hover:text-red-700" aria-label={`ลบ ${productName(line.product_id)}`}><Trash2 className="h-4 w-4" /></button></td></tr>)}{!lines.length ? <tr><td colSpan={6} className="px-8 py-8 text-center text-sm text-slate-500">ยังไม่มีรายการสินค้า</td></tr> : null}</tbody></table></section>
      </div><footer className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><span className="text-xs text-slate-500">รับครั้งนี้ {totals.quantity.toLocaleString('th-TH')} หน่วย · มูลค่า</span><strong className="ml-3 text-lg">{formatBaht(totals.total)}</strong></div><div className="flex justify-end gap-2"><button type="button" onClick={requestClose} className="h-10 px-3 text-sm text-slate-600">ยกเลิก</button><button type="button" onClick={() => void saveDraft()} disabled={working || !lines.length || (!po && !supplierId)} className="h-10 border border-primary-800 px-4 text-sm font-semibold text-primary-800 disabled:border-slate-300 disabled:text-slate-400">พักบิล</button><button type="button" onClick={requestFinalize} disabled={working || !lines.length || (!po && !supplierId)} className="h-10 bg-primary-800 px-4 text-sm font-semibold text-white disabled:bg-slate-300">{working ? 'กำลังดำเนินการ…' : 'ยืนยันนำเข้าและเพิ่มสต๊อก'}</button></div></footer></>}
    </section></div> : null}

    {detailOpen ? <div className="fixed inset-0 z-[55] flex justify-end bg-slate-950/35"><button type="button" className="absolute inset-0" aria-label="ปิดรายละเอียด" onClick={() => setDetailOpen(false)} /><aside role="dialog" aria-modal="true" className="relative flex h-dvh w-full max-w-xl flex-col bg-white shadow-2xl"><header className="flex min-h-16 items-center border-b border-slate-200 px-5"><div><p className="text-xs text-primary-800">รายละเอียดใบนำเข้า</p><h2 className="font-semibold">{detail?.documentNumber || 'กำลังโหลด…'}</h2></div><button type="button" onClick={() => setDetailOpen(false)} className="ml-auto grid h-9 w-9 place-items-center text-slate-500 hover:bg-slate-50" aria-label="ปิด"><X className="h-5 w-5" /></button></header>{detailLoading || !detail ? <div className="grid flex-1 place-items-center text-sm text-slate-500">กำลังโหลดรายละเอียด…</div> : <><div className="min-h-0 flex-1 overflow-y-auto p-5"><div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4"><span className={detail.status === 'draft' ? 'inline-flex items-center gap-1.5 text-amber-800' : 'inline-flex items-center gap-1.5 text-emerald-800'}>{detail.status === 'draft' ? <FileClock className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{detail.status === 'draft' ? 'พักไว้ ยังไม่เพิ่มสต๊อก' : 'ยืนยันแล้ว เพิ่มสต๊อกแล้ว'}</span><span className="text-xs text-slate-500">{detail.source === 'po' ? 'จาก PO' : 'รับเข้าโดยตรง'}</span></div><dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-b border-slate-200 py-4 text-sm"><div><dt className="text-xs text-slate-500">ผู้ขาย</dt><dd className="mt-1 font-medium">{detail.supplierName || '-'}</dd></div><div><dt className="text-xs text-slate-500">PO อ้างอิง</dt><dd className="mt-1 font-medium text-primary-800">{detail.purchaseOrderNumber || '-'}</dd></div><div><dt className="text-xs text-slate-500">วันที่รับเข้า</dt><dd className="mt-1">{formatDate(detail.receivedAt)}</dd></div><div><dt className="text-xs text-slate-500">แก้ไขล่าสุด</dt><dd className="mt-1">{formatDate(detail.updatedAt)}</dd></div><div><dt className="text-xs text-slate-500">วิธีชำระเงิน</dt><dd className="mt-1">{detail.paymentMethod || 'ไม่ระบุ / ตาม PO'}</dd></div><div><dt className="text-xs text-slate-500">มูลค่ารวม</dt><dd className="mt-1 font-semibold">{formatBaht(detail.totalAmount)}</dd></div></dl>{detail.note ? <div className="border-b border-slate-200 py-4"><p className="text-xs text-slate-500">หมายเหตุ</p><p className="mt-1 whitespace-pre-wrap text-sm">{detail.note}</p></div> : null}<section className="py-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">รายการสินค้า ({detail.itemCount})</h3><span className="text-xs text-slate-500">{detail.totalQuantity.toLocaleString('th-TH')} หน่วย</span></div><div className="mt-3 divide-y divide-slate-100 border-y border-slate-200">{detail.items.map((item) => <div key={item.id} className="flex gap-3 py-3"><span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden border border-slate-200 bg-slate-50">{item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" /> : <PackageCheck className="h-4 w-4 text-primary-800" />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.product_name}</p><p className="mt-0.5 text-xs text-primary-800">{item.unit_name} · {item.quantity.toLocaleString('th-TH')} หน่วย × {formatBaht(toNumber(item.unit_cost))}</p><p className="mt-0.5 text-xs text-slate-500">{item.sku || item.barcode || 'ไม่มีรหัส'} · 1 {item.unit_name} = {item.conversion_to_base.toLocaleString('th-TH')} หน่วยหลัก</p></div><strong className="shrink-0 text-sm">{formatBaht(toNumber(item.quantity) * toNumber(item.unit_cost))}</strong></div>)}</div></section></div>{detail.status === 'draft' ? <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3"><button type="button" onClick={() => { setDetailOpen(false); void editDraft(detail); }} className="h-10 border border-primary-800 px-4 text-sm font-semibold text-primary-800">แก้ไขต่อ</button><button type="button" onClick={() => requestDelete(detail)} className="h-10 border border-red-200 px-4 text-sm text-red-700">ลบทิ้ง</button></footer> : null}</>}</aside></div> : null}

    <CommerceConfirmDialog open={confirmKind === 'finalize'} busy={working} title="ยืนยันรับสินค้าเข้าสต๊อก" message={`ระบบจะบันทึกใบนี้และเพิ่ม ${lines.length.toLocaleString('th-TH')} รายการ รวม ${totals.quantity.toLocaleString('th-TH')} หน่วย มูลค่า ${formatBaht(totals.total)} เข้าสต๊อกทันที`} confirmLabel="ยืนยันรับเข้า" cancelLabel="กลับไปตรวจสอบ" onCancel={() => setConfirmKind(null)} onConfirm={finalize} />
    <CommerceConfirmDialog open={confirmKind === 'close'} title="ยังมีข้อมูลที่ยังไม่ได้บันทึก" message="ถ้าปิดตอนนี้ รายการที่กรอกไว้จะหายไป ต้องการออกจากหน้านี้หรือไม่" confirmLabel="ออกโดยไม่บันทึก" cancelLabel="กลับไปแก้ไข" onCancel={() => setConfirmKind(null)} onConfirm={discardClose} />
    <CommerceConfirmDialog open={confirmKind === 'delete'} busy={working} title="ลบใบนำเข้าที่พักไว้?" message="รายการนี้จะถูกลบออกจากประวัติ แต่ไม่มีผลต่อสต๊อกหรือยอดรับของ PO" confirmLabel="ลบทิ้ง" cancelLabel="ยกเลิก" onCancel={() => setConfirmKind(null)} onConfirm={deleteDraft} />
  </CommerceShell>;
}
