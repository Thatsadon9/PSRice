'use client';
/* eslint-disable @next/next/no-img-element */

import Select from '@/components/ui/Select';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CalendarDays, FilePlus2, PackagePlus, Plus, Trash2, X } from 'lucide-react';
import { CommerceShell } from '@/components/commerce/CommerceShell';
import { CommerceInitialState } from '@/components/commerce/CommerceInitialState';
import CommerceProductPicker from '@/components/commerce/CommerceProductPicker';
import CommerceUnitPicker from '@/components/commerce/CommerceUnitPicker';
import { CommerceBootstrap, formatBaht, toNumber } from '@/lib/commerce';
import { getAccessToken } from '@/lib/supabase';

type Supplier = { id: string; code: string | null; name: string; phone: string | null };
type PurchaseLine = { product_id: string; product_unit_id: string; quantity: number; unit_cost: number };
type PurchaseOrder = {
  id: string;
  purchase_order_number: string;
  status: string;
  document_date: string;
  grand_total: number | string;
  suppliers: { name: string } | null;
  purchase_order_items: Array<{ id: string; quantity_ordered: number | string }>;
};
type Recommendation = {
  supplier_id: string;
  product_id: string;
  product_unit_id: string;
  last_quantity: number;
  last_unit_cost: number;
  order_count: number;
  last_ordered_at: string;
};

async function commerceFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'ทำรายการไม่สำเร็จ');
  return body;
}

function todayInBangkok() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function nextSupplierCode(suppliers: Supplier[]) {
  return String(suppliers.reduce((largest, supplier) => /^\d+$/.test(supplier.code || '') ? Math.max(largest, Number(supplier.code)) : largest, 10000) + 1);
}

export default function PurchasingWorkspace() {
  const [bootstrap, setBootstrap] = useState<CommerceBootstrap | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [documentDate, setDocumentDate] = useState(todayInBangkok);
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('0');
  const [status, setStatus] = useState('กำลังโหลดใบสั่งซื้อ…');
  const [working, setWorking] = useState(false);
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState('');
  const [quickSupplierContact, setQuickSupplierContact] = useState('');
  const [quickSupplierPhone, setQuickSupplierPhone] = useState('');
  const [creatingSupplier, setCreatingSupplier] = useState(false);

  const load = useCallback(async (branchId?: string) => {
    try {
      setStatus('กำลังโหลดใบสั่งซื้อ…');
      const base = await commerceFetch(`/api/commerce/bootstrap${branchId ? `?branch_id=${encodeURIComponent(branchId)}` : ''}`) as CommerceBootstrap;
      const purchase = await commerceFetch(`/api/commerce/purchasing?branch_id=${encodeURIComponent(base.branchId)}`) as { suppliers: Supplier[]; purchaseOrders: PurchaseOrder[]; recommendations: Recommendation[] };
      setBootstrap(base);
      setSuppliers(purchase.suppliers);
      setOrders(purchase.purchaseOrders);
      setRecommendations(purchase.recommendations);
      setStatus('ข้อมูลล่าสุดแล้ว');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'ไม่สามารถโหลดใบสั่งซื้อได้');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedProduct = bootstrap?.products.find((product) => product.id === selectedProductId);
  const productsById = useMemo(() => new Map((bootstrap?.products || []).map((product) => [product.id, product])), [bootstrap?.products]);
  const supplierRecommendations = useMemo(() => recommendations
    .filter((item) => item.supplier_id === supplierId && !lines.some((line) => line.product_id === item.product_id && line.product_unit_id === item.product_unit_id))
    .slice(0, 8), [lines, recommendations, supplierId]);
  const lineTotal = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.unit_cost, 0), [lines]);

  const productName = (productId: string) => productsById.get(productId)?.name || 'สินค้า';
  const unitName = (productId: string, unitId: string) => productsById.get(productId)?.units.find((unit) => unit.id === unitId)?.name || 'หน่วย';
  const productImage = (productId: string, unitId?: string) => {
    const product = productsById.get(productId);
    return product?.units.find((unit) => unit.id === unitId)?.imageUrl || product?.imageUrl || null;
  };

  const selectProduct = (productId: string) => {
    const product = productsById.get(productId);
    const unit = product?.units.find((item) => item.isDefault) || product?.units[0];
    setSelectedProductId(productId);
    setSelectedUnitId(unit?.id || '');
    setUnitCost(unit && typeof unit.costPrice === 'number' ? String(unit.costPrice) : '0');
  };

  const selectUnit = (unitId: string) => {
    const unit = selectedProduct?.units.find((item) => item.id === unitId);
    setSelectedUnitId(unitId);
    setUnitCost(unit && typeof unit.costPrice === 'number' ? String(unit.costPrice) : '0');
  };

  const appendLine = (line: PurchaseLine) => {
    setLines((current) => {
      const index = current.findIndex((item) => item.product_id === line.product_id && item.product_unit_id === line.product_unit_id);
      if (index < 0) return [...current, line];
      return current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: item.quantity + line.quantity, unit_cost: line.unit_cost } : item);
    });
  };

  const addSelectedProduct = () => {
    const parsedQuantity = toNumber(quantity);
    const parsedCost = toNumber(unitCost);
    if (!selectedProduct || !selectedUnitId || parsedQuantity <= 0 || parsedCost < 0) {
      setStatus('เลือกสินค้า หน่วย จำนวน และต้นทุนให้ครบ');
      return;
    }
    appendLine({ product_id: selectedProduct.id, product_unit_id: selectedUnitId, quantity: parsedQuantity, unit_cost: parsedCost });
    setSelectedProductId(''); setSelectedUnitId(''); setQuantity('1'); setUnitCost('0');
  };

  const addRecommendation = (item: Recommendation) => {
    appendLine({ product_id: item.product_id, product_unit_id: item.product_unit_id, quantity: item.last_quantity, unit_cost: item.last_unit_cost });
  };

  const openEditor = () => {
    setSupplierId('');
    setDocumentDate(todayInBangkok());
    setNote(''); setLines([]); setSelectedProductId(''); setSelectedUnitId(''); setEditorOpen(true);
  };

  const createOrder = async () => {
    if (!bootstrap || !supplierId || !lines.length) { setStatus('เลือกผู้ขายและเพิ่มสินค้าอย่างน้อยหนึ่งรายการ'); return; }
    try {
      setWorking(true);
      const result = await commerceFetch('/api/commerce/purchasing', {
        method: 'POST',
        body: JSON.stringify({ branch_id: bootstrap.branchId, supplier_id: supplierId, document_date: documentDate, note, items: lines }),
      }) as { purchaseOrder: { purchase_order_number: string } };
      setEditorOpen(false);
      await load(bootstrap.branchId);
      setStatus(`สร้าง ${result.purchaseOrder.purchase_order_number} แล้ว พร้อมนำเข้าเมื่อสินค้าเข้าร้าน`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'สร้างใบสั่งซื้อไม่สำเร็จ');
    } finally { setWorking(false); }
  };

  const createQuickSupplier = async () => {
    if (!quickSupplierName.trim() || !quickSupplierPhone.trim()) return;
    try {
      setCreatingSupplier(true);
      const result = await commerceFetch('/api/commerce/suppliers', {
        method: 'POST',
        body: JSON.stringify({ code: nextSupplierCode(suppliers), name: quickSupplierName, contact_name: quickSupplierContact, phone: quickSupplierPhone }),
      }) as { supplier: Supplier };
      setSuppliers((current) => [...current, result.supplier].sort((left, right) => left.name.localeCompare(right.name, 'th')));
      setSupplierId(result.supplier.id);
      setQuickSupplierOpen(false);
      setQuickSupplierName(''); setQuickSupplierContact(''); setQuickSupplierPhone('');
      setStatus(`เพิ่ม ${result.supplier.name} และเลือกในใบสั่งซื้อนี้แล้ว`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'เพิ่มผู้ขายคู่ค้าไม่สำเร็จ');
    } finally { setCreatingSupplier(false); }
  };

  if (!bootstrap) return <CommerceShell section="purchasing"><main className="mx-auto max-w-[1500px] px-4 py-6"><CommerceInitialState status={status} onRetry={() => void load()} label="กำลังโหลดใบสั่งซื้อ…" /></main></CommerceShell>;

  return <CommerceShell section="purchasing">
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold text-primary-800">บริหารสต๊อก</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">ใบสั่งซื้อ (PO)</h1><p className="mt-1 text-sm text-slate-500">จัดทำและติดตามเอกสารสั่งซื้อของสาขา</p></div>
        <button type="button" onClick={openEditor} className="inline-flex h-10 items-center gap-2 bg-primary-800 px-4 text-sm font-semibold text-white hover:bg-primary-900"><FilePlus2 className="h-4 w-4" />สร้างใบสั่งซื้อ</button>
      </header>
      <p className="min-h-8 py-2 text-xs text-slate-500" role="status">{status}</p>
      <section className="overflow-hidden border-y border-slate-200 bg-white">
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs font-medium text-slate-500"><tr><th className="px-4 py-3">เลขที่อ้างอิง</th><th className="px-4 py-3">วันที่ออกเอกสาร</th><th className="px-4 py-3">ผู้ขายคู่ค้า</th><th className="px-4 py-3 text-right">รายการ</th><th className="px-4 py-3 text-right">ยอดรวม</th><th className="px-4 py-3">สถานะ</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-slate-100 hover:bg-slate-50/70"><td className="px-4 py-3 font-semibold text-slate-800">{order.purchase_order_number}</td><td className="px-4 py-3 text-slate-600">{new Date(`${order.document_date}T00:00:00`).toLocaleDateString('th-TH')}</td><td className="px-4 py-3">{order.suppliers?.name || '-'}</td><td className="px-4 py-3 text-right">{order.purchase_order_items.reduce((sum, item) => sum + toNumber(item.quantity_ordered), 0).toLocaleString('th-TH')}</td><td className="px-4 py-3 text-right font-medium">{formatBaht(toNumber(order.grand_total))}</td><td className="px-4 py-3 text-slate-600">{PURCHASE_STATUS_LABELS[order.status] || order.status}</td></tr>)}{!orders.length && <tr><td colSpan={6} className="px-4 py-16 text-center"><FilePlus2 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-medium">ยังไม่มีใบสั่งซื้อ</p></td></tr>}</tbody></table></div>
      </section>
    </main>

    {editorOpen ? <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35"><button type="button" aria-label="ปิดหน้าสร้างใบสั่งซื้อ" className="absolute inset-0" onClick={() => !working && setEditorOpen(false)} /><section role="dialog" aria-modal="true" aria-label="สร้างใบสั่งซื้อ" className="relative flex h-dvh w-full max-w-4xl flex-col bg-[#f8f9f8] shadow-2xl"><div className="flex h-16 items-center border-b border-slate-200 bg-white px-5"><div><h2 className="font-semibold">สร้างใบสั่งซื้อ</h2><p className="text-xs text-slate-500">เลขที่อ้างอิงสร้างอัตโนมัติเมื่อบันทึก</p></div><button type="button" onClick={() => setEditorOpen(false)} className="ml-auto grid h-9 w-9 place-items-center text-slate-500 hover:bg-slate-100" aria-label="ปิด"><X className="h-5 w-5" /></button></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5"><div className="grid gap-4 border-b border-slate-200 pb-5 sm:grid-cols-2"><div><div className="flex items-center justify-between gap-3"><label htmlFor="po-supplier" className="text-sm font-medium">ผู้ขายคู่ค้า</label><button type="button" onClick={() => setQuickSupplierOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary-800 hover:underline"><Plus className="h-3.5 w-3.5" />เพิ่มคู่ค้าใหม่</button></div><Select id="po-supplier" required value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="mt-1.5 h-11 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700"><option value="">เลือกผู้ขาย</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code ? `${supplier.code} — ` : ''}{supplier.name}</option>)}</Select>{!suppliers.length ? <p className="mt-1.5 text-xs text-amber-700">ไม่พบข้อมูลคู่ค้า</p> : null}</div><label className="text-sm font-medium">วันที่ออกเอกสาร<span className="relative mt-1.5 block"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} className="h-11 w-full border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-primary-700" /></span></label></div>
      {supplierId && supplierRecommendations.length ? <div className="border-b border-slate-200 py-5"><div className="flex items-baseline justify-between"><h3 className="text-sm font-semibold">สินค้าที่เคยสั่งกับผู้ขายรายนี้</h3><span className="text-xs text-slate-500">จำนวนและต้นทุนล่าสุด</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{supplierRecommendations.map((item) => <button key={`${item.product_id}:${item.product_unit_id}`} type="button" onClick={() => addRecommendation(item)} className="flex items-center gap-3 border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-primary-700 hover:bg-primary-50"><span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden border border-slate-200 bg-slate-50">{productImage(item.product_id, item.product_unit_id) ? <img src={productImage(item.product_id, item.product_unit_id) || undefined} alt="" className="h-full w-full object-cover" /> : <PackagePlus className="h-4 w-4 text-primary-800" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{productName(item.product_id)}</span><span className="block text-xs text-slate-500">ล่าสุด {item.last_quantity.toLocaleString('th-TH')} {unitName(item.product_id, item.product_unit_id)} · {formatBaht(item.last_unit_cost)} · เคยสั่ง {item.order_count} ครั้ง</span></span></button>)}</div></div> : null}
      <div className="py-5"><h3 className="text-sm font-semibold">เพิ่มรายการสินค้า</h3><div className="mt-3"><CommerceProductPicker products={bootstrap.products} value={selectedProductId} onValueChange={(productId) => selectProduct(productId)} placeholder="ค้นหาหรือเลือกสินค้า" aria-label="สินค้าในใบสั่งซื้อ" className="h-11 w-full" /></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_auto]"><CommerceUnitPicker units={selectedProduct?.units || []} product={selectedProduct} value={selectedUnitId} onValueChange={selectUnit} disabled={!selectedProduct} placeholder={selectedProduct ? 'เลือกหน่วยสินค้า' : 'เลือกสินค้าก่อน'} className="h-10 w-full" /><input type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="h-10 border border-slate-300 px-2 text-right text-sm" aria-label="จำนวน" placeholder="จำนวน" /><input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} className="h-10 border border-slate-300 px-2 text-right text-sm" aria-label="ต้นทุนต่อหน่วย" placeholder="ต้นทุน/หน่วย" /><button type="button" onClick={addSelectedProduct} className="h-10 border border-primary-800 px-4 text-sm font-semibold text-primary-800 hover:bg-primary-50">เพิ่มรายการ</button></div>
      <div className="mt-5 overflow-x-auto border-y border-slate-200 bg-white"><table className="w-full min-w-[680px] text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2.5">สินค้า</th><th className="px-3 py-2.5">หน่วย</th><th className="px-3 py-2.5 text-right">จำนวน</th><th className="px-3 py-2.5 text-right">ต้นทุน/หน่วย</th><th className="px-3 py-2.5 text-right">รวม</th><th className="w-12"></th></tr></thead><tbody>{lines.map((line, index) => <tr key={`${line.product_id}:${line.product_unit_id}`} className="border-t border-slate-100"><td className="px-3 py-2.5"><span className="flex items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden border border-slate-200 bg-slate-50">{productImage(line.product_id, line.product_unit_id) ? <img src={productImage(line.product_id, line.product_unit_id) || undefined} alt="" className="h-full w-full object-cover" /> : <PackagePlus className="h-3.5 w-3.5 text-primary-800" />}</span><span className="font-medium">{productName(line.product_id)}</span></span></td><td className="px-3 py-2.5 text-slate-600">{unitName(line.product_id, line.product_unit_id)}</td><td className="px-3 py-2.5"><input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: toNumber(event.target.value) } : item))} className="ml-auto block h-8 w-24 border border-slate-300 px-2 text-right" /></td><td className="px-3 py-2.5"><input type="number" min="0" step="0.01" value={line.unit_cost} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unit_cost: toNumber(event.target.value) } : item))} className="ml-auto block h-8 w-28 border border-slate-300 px-2 text-right" /></td><td className="px-3 py-2.5 text-right font-medium">{formatBaht(line.quantity * line.unit_cost)}</td><td><button type="button" onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="grid h-8 w-8 place-items-center text-slate-400 hover:bg-red-50 hover:text-red-700" aria-label={`ลบ ${productName(line.product_id)}`}><Trash2 className="h-4 w-4" /></button></td></tr>)}{!lines.length ? <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">ยังไม่มีสินค้าในใบสั่งซื้อ</td></tr> : null}</tbody></table></div>
      <label className="mt-5 block text-sm font-medium">หมายเหตุ (ถ้ามี)<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1.5 w-full resize-none border border-slate-300 bg-white p-3 text-sm outline-none focus:border-primary-700" /></label></div></div>
      <footer className="flex items-center justify-between gap-4 border-t border-slate-200 bg-white px-5 py-4"><div><span className="text-xs text-slate-500">รวม {lines.length} รายการ</span><strong className="ml-3 text-lg">{formatBaht(lineTotal)}</strong></div><div className="flex gap-2"><button type="button" onClick={() => setEditorOpen(false)} disabled={working} className="h-10 px-4 text-sm text-slate-600">ยกเลิก</button><button type="button" onClick={() => void createOrder()} disabled={working || !supplierId || !lines.length} className="h-10 bg-primary-800 px-5 text-sm font-semibold text-white disabled:bg-slate-300">{working ? 'กำลังบันทึก…' : 'บันทึกใบสั่งซื้อ'}</button></div></footer></section></div> : null}
    {quickSupplierOpen ? <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4"><button type="button" className="absolute inset-0" aria-label="ปิดหน้าต่างเพิ่มคู่ค้า" onClick={() => !creatingSupplier && setQuickSupplierOpen(false)} /><section role="dialog" aria-modal="true" aria-label="เพิ่มผู้ขายคู่ค้าใหม่" className="relative w-full max-w-lg bg-white shadow-2xl"><header className="flex items-center gap-3 border-b border-slate-200 px-5 py-4"><span className="grid h-10 w-10 place-items-center bg-primary-50 text-primary-800"><Building2 className="h-5 w-5" /></span><div><h3 className="font-semibold">เพิ่มผู้ขายคู่ค้าใหม่</h3><p className="text-xs text-slate-500">สร้างและเลือกใช้ใน PO ปัจจุบัน</p></div><button type="button" onClick={() => setQuickSupplierOpen(false)} className="ml-auto grid h-8 w-8 place-items-center text-slate-500 hover:bg-slate-100" aria-label="ปิด"><X className="h-4 w-4" /></button></header><div className="space-y-4 p-5"><label className="block text-sm font-medium">ชื่อบริษัท / ร้านค้า <span className="text-red-600">*</span><input autoFocus value={quickSupplierName} onChange={(event) => setQuickSupplierName(event.target.value)} placeholder="เช่น บริษัท ไทยค้าข้าว จำกัด" className="mt-1.5 h-11 w-full border border-slate-300 px-3 text-sm outline-none focus:border-primary-700" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">ชื่อผู้ติดต่อ<input value={quickSupplierContact} onChange={(event) => setQuickSupplierContact(event.target.value)} placeholder="ไม่บังคับ" className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm outline-none focus:border-primary-700" /></label><label className="block text-sm font-medium">เบอร์โทร <span className="text-red-600">*</span><input required type="tel" value={quickSupplierPhone} onChange={(event) => setQuickSupplierPhone(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm outline-none focus:border-primary-700" /></label></div><p className="text-xs text-slate-500">รหัสคู่ค้าสร้างอัตโนมัติ · ข้อมูลบัญชีแก้ไขได้ที่เมนู “ผู้ขาย / คู่ค้า”</p></div><footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" onClick={() => setQuickSupplierOpen(false)} disabled={creatingSupplier} className="h-10 px-4 text-sm text-slate-600">ยกเลิก</button><button type="button" onClick={() => void createQuickSupplier()} disabled={creatingSupplier || !quickSupplierName.trim() || !quickSupplierPhone.trim()} className="h-10 bg-primary-800 px-5 text-sm font-semibold text-white disabled:bg-slate-300">{creatingSupplier ? 'กำลังเพิ่ม…' : 'เพิ่มและเลือกคู่ค้านี้'}</button></footer></section></div> : null}
  </CommerceShell>;
}

const PURCHASE_STATUS_LABELS: Record<string, string> = {
  draft: 'แบบร่าง', submitted: 'รออนุมัติ', approved: 'รอนำเข้าสินค้า', partially_received: 'นำเข้าบางส่วน', received: 'นำเข้าครบแล้ว', cancelled: 'ยกเลิก',
};
