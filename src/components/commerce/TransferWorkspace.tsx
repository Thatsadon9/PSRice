'use client';
/* eslint-disable @next/next/no-img-element */

import Select from '@/components/ui/Select';
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { ArrowLeftRight, CheckCircle2, CircleHelp, Package, Plus, Trash2, Truck, X } from 'lucide-react';
import { CommerceShell } from '@/components/commerce/CommerceShell';
import { CommerceInitialState } from '@/components/commerce/CommerceInitialState';
import CommerceConfirmDialog from '@/components/commerce/CommerceConfirmDialog';
import CommerceProductPicker, { commerceUnitImage } from '@/components/commerce/CommerceProductPicker';
import CommerceUnitPicker from '@/components/commerce/CommerceUnitPicker';
import { getAccessToken } from '@/lib/supabase';
import { CommerceBootstrap, CommerceProduct, CommerceUnit, toNumber } from '@/lib/commerce';

type TransferItem = {
  id: string;
  product_id: string;
  product_unit_id: string;
  quantity_requested: number | string;
  quantity_shipped: number | string;
  quantity_received: number | string;
  quantity_damaged: number | string;
  products: { name: string } | null;
  product_units: { name: string } | null;
};

type Transfer = {
  id: string;
  transfer_number: string;
  source_branch_id: string;
  destination_branch_id: string;
  status: string;
  requested_at: string;
  carrier_name: string | null;
  vehicle_registration: string | null;
  note: string | null;
  stock_transfer_items: TransferItem[];
};

type DraftLine = { product_id: string; product_unit_id: string; quantity: number; name: string; unit: string };
type TransferAction = { transfer: Transfer; action: 'ship' | 'receive' };

async function request(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'ทำรายการไม่สำเร็จ');
  return body;
}

function formatQuantity(value: number | string) {
  return toNumber(value).toLocaleString('th-TH', { maximumFractionDigits: 3 });
}

function conversionLabel(product: CommerceProduct, unit: CommerceUnit) {
  if (unit.isDefault || unit.conversionToBase === 1) return 'หน่วยหลัก';
  const base = product.units.find((candidate) => candidate.isDefault) || product.units.find((candidate) => candidate.conversionToBase === 1);
  return base ? `1 ${unit.name} = ${formatQuantity(unit.conversionToBase)} ${base.name}` : `เท่ากับ ${formatQuantity(unit.conversionToBase)} หน่วยหลัก`;
}

function statusLabel(status: string) {
  return ({ requested: 'รอส่งสินค้า', approved: 'อนุมัติแล้ว', in_transit: 'กำลังโอน', received: 'รับครบแล้ว', problem: 'มีปัญหา', cancelled: 'ยกเลิกแล้ว' } as Record<string, string>)[status] || status;
}

function statusClass(status: string) {
  if (status === 'received') return 'bg-emerald-50 text-emerald-800';
  if (status === 'problem') return 'bg-rose-50 text-rose-800';
  if (status === 'in_transit') return 'bg-sky-50 text-sky-800';
  if (status === 'cancelled') return 'bg-slate-100 text-slate-600';
  return 'bg-amber-50 text-amber-800';
}

export default function TransferWorkspace() {
  const [data, setData] = useState<CommerceBootstrap | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [destination, setDestination] = useState('');
  const [productId, setProductId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [status, setStatus] = useState('กำลังโหลดใบโอน…');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDirty, setCreateDirty] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createNote, setCreateNote] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [active, setActive] = useState<TransferAction | null>(null);
  const [quantities, setQuantities] = useState<Record<string, { shipped: string; received: string; damaged: string }>>({});
  const [carrier, setCarrier] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const bootstrap = await request('/api/commerce/bootstrap') as CommerceBootstrap;
      const result = await request(`/api/commerce/transfers?branch_id=${bootstrap.branchId}`) as { transfers: Transfer[] };
      setData(bootstrap);
      setTransfers(result.transfers);
      setDestination((current) => current || bootstrap.branches.find((branch) => branch.id !== bootstrap.branchId)?.id || '');
      setStatus('เลือกสินค้าและหน่วยจริง แล้วดำเนินการ Pick / Pack / Ship / Receive ตามลำดับ');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const branches = useMemo(() => new Map((data?.branches || []).map((branch) => [branch.id, branch.name])), [data]);
  const selectedProduct = data?.products.find((item) => item.id === productId);
  const selectedUnit = selectedProduct?.units.find((item) => item.id === unitId);
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

  const resetCreateForm = useCallback(() => {
    setCreateOpen(false);
    setCreateDirty(false);
    setCreateError('');
    setCreateNote('');
    setProductId('');
    setUnitId('');
    setQuantity('1');
    setLines([]);
  }, []);

  const openCreate = () => {
    if (!data) return;
    setDestination(data.branches.find((branch) => branch.id !== data.branchId)?.id || '');
    setProductId('');
    setUnitId('');
    setQuantity('1');
    setLines([]);
    setCreateNote('');
    setCreateError('');
    setCreateDirty(false);
    setCreateOpen(true);
  };

  const requestCloseCreate = () => {
    if (working) return;
    if (createDirty || lines.length > 0 || createNote.trim()) {
      setConfirmClose(true);
      return;
    }
    resetCreateForm();
  };

  const selectProduct = (nextProductId: string) => {
    const product = data?.products.find((item) => item.id === nextProductId);
    setCreateDirty(true);
    setCreateError('');
    setProductId(nextProductId);
    const firstSellableUnit = product?.units.find((item) => item.isDefault && item.canSell) || product?.units.find((item) => item.canSell);
    setUnitId(firstSellableUnit?.id || '');
  };

  const addLine = () => {
    const product = data?.products.find((item) => item.id === productId);
    const unit = product?.units.find((item) => item.id === unitId);
    const parsedQuantity = toNumber(quantity);
    if (!product) return setCreateError('กรุณาเลือกสินค้าที่ต้องการโอน');
    if (!unit || !unit.canSell) return setCreateError('กรุณาเลือกหน่วยที่เปิดให้โอนออก');
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return setCreateError('จำนวนโอนต้องมากกว่า 0');
    setLines((current) => [
      ...current.filter((line) => !(line.product_id === product.id && line.product_unit_id === unit.id)),
      { product_id: product.id, product_unit_id: unit.id, quantity: parsedQuantity, name: product.name, unit: unit.name },
    ]);
    setCreateDirty(true);
    setCreateError('');
    setProductId('');
    setUnitId('');
    setQuantity('1');
  };

  const updateLineQuantity = (line: DraftLine, nextValue: string) => {
    const nextQuantity = toNumber(nextValue);
    setCreateDirty(true);
    setLines((current) => current.map((item) => item.product_id === line.product_id && item.product_unit_id === line.product_unit_id ? { ...item, quantity: Number.isFinite(nextQuantity) ? nextQuantity : 0 } : item));
  };

  const removeLine = (line: DraftLine) => {
    setCreateDirty(true);
    setLines((current) => current.filter((item) => !(item.product_id === line.product_id && item.product_unit_id === line.product_unit_id)));
  };

  const create = async () => {
    if (!data) return;
    if (!destination) return setCreateError('กรุณาเลือกสาขาปลายทาง');
    if (!lines.length) return setCreateError('เพิ่มสินค้าอย่างน้อย 1 รายการก่อนสร้างใบโอน');
    if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) return setCreateError('ตรวจสอบจำนวนสินค้าในรายการให้มากกว่า 0');
    try {
      setWorking(true);
      await request('/api/commerce/transfers', { method: 'POST', body: JSON.stringify({ source_branch_id: data.branchId, destination_branch_id: destination, items: lines, note: createNote.trim() || null }) });
      resetCreateForm();
      setStatus('สร้างคำขอโอนแล้ว ตรวจสอบรายการในประวัติด้านล่างได้ทันที');
      await load();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'สร้างใบโอนไม่สำเร็จ');
    } finally {
      setWorking(false);
    }
  };

  const openAction = (transfer: Transfer, action: 'ship' | 'receive') => {
    setActive({ transfer, action });
    setCarrier(transfer.carrier_name || '');
    setVehicle(transfer.vehicle_registration || '');
    setNote('');
    setQuantities(Object.fromEntries(transfer.stock_transfer_items.map((item) => [item.id, { shipped: String(item.quantity_requested), received: String(item.quantity_shipped), damaged: '0' }])));
  };

  const submitAction = async () => {
    if (!active || !data) return;
    const items = active.transfer.stock_transfer_items.map((item) => active.action === 'ship' ? { item_id: item.id, quantity: toNumber(quantities[item.id]?.shipped) } : { item_id: item.id, quantity_received: toNumber(quantities[item.id]?.received), quantity_damaged: toNumber(quantities[item.id]?.damaged) });
    try {
      setWorking(true);
      await request('/api/commerce/transfers', { method: 'POST', body: JSON.stringify({ action: active.action, transfer_id: active.transfer.id, branch_id: data.branchId, items, carrier, vehicle, note }) });
      setActive(null);
      setStatus(active.action === 'ship' ? 'บันทึกการส่งสินค้าแล้ว' : 'บันทึกผลตรวจรับแล้ว');
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'ทำรายการไม่สำเร็จ');
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <CommerceShell section="backoffice"><main className="mx-auto max-w-[1380px] p-5"><CommerceInitialState status={status} onRetry={() => { setLoading(true); void load(); }} label="กำลังโหลดงานโอนสินค้า…" /></main></CommerceShell>;

  return <CommerceShell section="backoffice"><main className="mx-auto max-w-[1380px] p-5">
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-medium text-primary-800">Inventory / Transfer</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">รับ–โอนสินค้าระหว่างสาขา</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">โอนสินค้าเป็นขั้นตอน พร้อมบันทึกจำนวนส่งจริง จำนวนรับ และของเสียหายแยกจากกัน</p></div><button type="button" onClick={openCreate} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 bg-primary-800 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"><ArrowLeftRight className="size-4" />โอนสินค้า</button></header>
    <section className="mt-5 overflow-hidden border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h2 className="text-sm font-semibold text-slate-950">ประวัติการโอนสินค้า</h2><p className="mt-0.5 text-xs text-slate-500">ใบโอนของสาขานี้ แสดงงานถัดไปตามสิทธิ์และสถานะปัจจุบัน</p></div><span className="text-xs text-slate-500">{transfers.length.toLocaleString('th-TH')} ใบ</span></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">เลขที่ / วันที่</th><th className="px-4 py-3">เส้นทาง</th><th className="px-4 py-3">รายการสินค้า</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3 text-right">งานถัดไป</th></tr></thead><tbody>{transfers.map((transfer) => { const nextAction = transfer.status === 'requested' && transfer.source_branch_id === data?.branchId ? 'ship' : transfer.status === 'in_transit' && transfer.destination_branch_id === data?.branchId ? 'receive' : null; return <tr key={transfer.id} className="border-t border-slate-100 align-top"><td className="px-4 py-4"><p className="font-semibold text-slate-900">{transfer.transfer_number}</p><p className="mt-1 text-xs text-slate-500">{new Date(transfer.requested_at).toLocaleString('th-TH')}</p></td><td className="px-4 py-4 text-slate-700">{branches.get(transfer.source_branch_id) || 'ไม่ทราบสาขา'} <span className="px-1 text-slate-400">→</span> {branches.get(transfer.destination_branch_id) || 'ไม่ทราบสาขา'}</td><td className="px-4 py-4"><div className="space-y-2">{transfer.stock_transfer_items.map((item) => { const product = data?.products.find((candidate) => candidate.id === item.product_id); const unit = product?.units.find((candidate) => candidate.id === item.product_unit_id); const image = unit && product ? commerceUnitImage(unit, product) : product?.imageUrl; return <div key={item.id} className="flex items-center gap-2.5"><span className="grid size-9 shrink-0 place-items-center overflow-hidden border border-slate-200 bg-slate-50">{image ? <img src={image} alt="" className="size-full object-cover" /> : <Package className="size-4 text-slate-300" />}</span><span className="min-w-0"><span className="block truncate font-medium text-slate-800">{item.products?.name || product?.name || item.product_id}</span><span className="block text-xs text-slate-500">{item.product_units?.name || unit?.name || 'หน่วย'} · ขอ {formatQuantity(item.quantity_requested)} · ส่ง {formatQuantity(item.quantity_shipped)} · รับ {formatQuantity(item.quantity_received)}{toNumber(item.quantity_damaged) ? ` · เสีย ${formatQuantity(item.quantity_damaged)}` : ''}</span></span></div>; })}</div></td><td className="px-4 py-4"><span className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold ${statusClass(transfer.status)}`}>{statusLabel(transfer.status)}</span></td><td className="px-4 py-4 text-right">{nextAction === 'ship' ? <button type="button" onClick={() => openAction(transfer, 'ship')} className="h-9 border border-primary-700 px-3 text-xs font-semibold text-primary-800 transition hover:bg-primary-50">Pick / Pack / Ship</button> : null}{nextAction === 'receive' ? <button type="button" onClick={() => openAction(transfer, 'receive')} className="h-9 bg-primary-800 px-3 text-xs font-semibold text-white transition hover:bg-primary-900">ตรวจรับสินค้า</button> : null}{!nextAction ? <span className="text-xs text-slate-400">—</span> : null}</td></tr>; })}{!transfers.length ? <tr><td colSpan={5} className="px-4 py-16 text-center text-sm text-slate-500">ยังไม่มีใบโอนของสาขานี้<br /><span className="mt-1 block text-xs text-slate-400">กด “โอนสินค้า” เพื่อสร้างคำขอใหม่</span></td></tr> : null}</tbody></table></div></section>

    {createOpen && data ? <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35"><button type="button" aria-label="ปิดหน้าต่างโอนสินค้า" onClick={requestCloseCreate} className="absolute inset-0 cursor-default" /><aside role="dialog" aria-modal="true" aria-labelledby="transfer-drawer-title" className="relative flex h-dvh w-full max-w-3xl flex-col bg-[#f8faf9] shadow-2xl"><header className="flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-7"><div><div className="flex items-center gap-2 text-primary-800"><ArrowLeftRight className="size-4" /><span className="text-xs font-semibold">สร้างคำขอโอนสินค้า</span></div><h2 id="transfer-drawer-title" className="mt-1 text-xl font-semibold text-slate-950">โอนสินค้าระหว่างสาขา</h2><p className="mt-1 text-sm text-slate-500">กรอกเส้นทางและรายการสินค้าที่ต้องการโอน แล้วกดบันทึกคำขอ</p></div><button type="button" onClick={requestCloseCreate} aria-label="ปิด" className="grid size-10 shrink-0 place-items-center text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><X className="size-5" /></button></header><div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7"><section className="border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-semibold text-slate-950">เส้นทางการโอน</h3></div><div className="grid gap-4 p-4 sm:grid-cols-2"><div><span className="mb-1.5 block text-sm font-medium text-slate-700">ต้นทาง</span><div className="flex h-12 items-center gap-3 border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700"><span className="grid size-7 place-items-center bg-white text-primary-800"><Truck className="size-4" /></span>{branches.get(data.branchId) || 'สาขาปัจจุบัน'}<span className="ml-auto text-xs font-normal text-slate-500">สาขาปัจจุบัน</span></div></div><div><label htmlFor="transfer-destination" className="mb-1.5 block text-sm font-medium text-slate-700">ปลายทาง <span className="text-red-600">*</span></label><Select id="transfer-destination" name="transfer-destination" required value={destination} onValueChange={(nextValue) => { setDestination(nextValue); setCreateDirty(true); setCreateError(''); }} placeholder="เลือกสาขาปลายทาง" aria-label="สาขาปลายทาง" className="h-12 w-full" shape="square" options={data.branches.filter((branch) => branch.id !== data.branchId).map((branch) => ({ value: branch.id, label: branch.name }))} /></div></div><div className="px-4 pb-4"><label htmlFor="transfer-note" className="mb-1.5 block text-sm font-medium text-slate-700">หมายเหตุ <span className="font-normal text-slate-400">(ไม่บังคับ)</span></label><textarea id="transfer-note" value={createNote} onChange={(event) => { setCreateNote(event.target.value); setCreateDirty(true); }} rows={2} placeholder="เช่น เติมสินค้าให้สาขาปลายทางก่อนวันขาย" className="w-full resize-y border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-100" /></div></section><section className="mt-4 border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-semibold text-slate-950">เพิ่มรายการสินค้า</h3><p className="mt-1 text-xs text-slate-500">เลือกสินค้าและหน่วยที่ต้องการโอนออกจากสต๊อกของสาขาต้นทาง</p></div><div className="p-4"><div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(11rem,.8fr)_8rem_auto] lg:items-end"><div><label className="mb-1.5 block text-sm font-medium text-slate-700">สินค้า <span className="text-red-600">*</span></label><CommerceProductPicker products={data.products} value={productId} onValueChange={selectProduct} placeholder="เลือกสินค้า" aria-label="สินค้าโอน" required name="transfer-product" className="h-12 w-full" /></div><div><label className="mb-1.5 block text-sm font-medium text-slate-700">หน่วยโอน <span className="text-red-600">*</span></label><CommerceUnitPicker units={(selectedProduct?.units || []).filter((unit) => unit.canSell)} product={selectedProduct} value={unitId} onValueChange={(nextUnitId) => { setUnitId(nextUnitId); setCreateDirty(true); setCreateError(''); }} disabled={!selectedProduct} placeholder={selectedProduct ? 'เลือกหน่วย' : 'เลือกสินค้าก่อน'} aria-label="หน่วยโอน" required name="transfer-unit" showStock className="h-12 w-full" /></div><div><label htmlFor="transfer-quantity" className="mb-1.5 block text-sm font-medium text-slate-700">จำนวน <span className="text-red-600">*</span></label><input id="transfer-quantity" aria-label="จำนวนโอน" type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => { setQuantity(event.target.value); setCreateDirty(true); setCreateError(''); }} className="h-12 w-full border border-slate-300 bg-white px-3 text-right text-sm outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-100" /></div><button type="button" onClick={addLine} className="inline-flex h-12 items-center justify-center gap-2 border border-primary-700 px-4 text-sm font-semibold text-primary-800 transition hover:bg-primary-50"><Plus className="size-4" />เพิ่มรายการ</button></div>{selectedUnit && selectedProduct ? <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><CircleHelp className="size-3.5" />คงเหลือ {formatQuantity(selectedUnit.available)} {selectedUnit.name} · {conversionLabel(selectedProduct, selectedUnit)}</p> : null}<div className="mt-5 border-t border-slate-100 pt-4"><div className="mb-3 flex items-center justify-between"><h4 className="text-sm font-semibold text-slate-800">รายการที่จะโอน</h4><span className="text-xs text-slate-500">{lines.length.toLocaleString('th-TH')} รายการ</span></div>{lines.length ? <div className="divide-y divide-slate-100 border border-slate-200">{lines.map((line) => { const product = data.products.find((item) => item.id === line.product_id); const unit = product?.units.find((item) => item.id === line.product_unit_id); const image = product && unit ? commerceUnitImage(unit, product) : product?.imageUrl; return <div key={`${line.product_id}:${line.product_unit_id}`} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-center"><div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center overflow-hidden border border-slate-200 bg-slate-50">{image ? <img src={image} alt="" className="size-full object-cover" /> : <Package className="size-5 text-slate-300" />}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{line.name}</span><span className="block text-xs text-slate-500">{line.unit} · {unit && product ? conversionLabel(product, unit) : 'หน่วยสินค้า'}</span></span></div><label className="flex items-center gap-2 text-xs text-slate-500 sm:block"><span className="shrink-0 sm:mb-1 sm:block">จำนวน</span><input aria-label={`จำนวน ${line.name} ${line.unit}`} type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLineQuantity(line, event.target.value)} className="h-10 w-full border border-slate-300 px-2 text-right text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100" /></label><button type="button" onClick={() => removeLine(line)} aria-label={`ลบ ${line.name} ${line.unit}`} className="grid size-10 place-items-center justify-self-end border border-slate-200 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"><Trash2 className="size-4" /></button></div>; })}</div> : <div className="border border-dashed border-slate-300 px-4 py-8 text-center"><Package className="mx-auto size-6 text-slate-300" /><p className="mt-2 text-sm text-slate-500">ยังไม่มีรายการสินค้า</p><p className="mt-1 text-xs text-slate-400">เลือกสินค้า หน่วย และจำนวน แล้วกดเพิ่มรายการ</p></div>}</div>{createError ? <div role="alert" className="mt-4 border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{createError}</div> : null}</div></section><div className="mt-4 flex items-start gap-2 border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary-700" /><span>การสร้างคำขอยังไม่ตัดสต๊อก สต๊อกจะถูกตัดเมื่อสาขาต้นทางกดยืนยันส่งสินค้าเท่านั้น</span></div></div><footer className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7"><p className="text-sm text-slate-500">{lines.length.toLocaleString('th-TH')} รายการ · รวม {formatQuantity(totalQuantity)} หน่วย</p><div className="flex justify-end gap-2"><button type="button" onClick={requestCloseCreate} disabled={working} className="h-11 border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button><button type="button" onClick={() => void create()} disabled={working || !lines.length} className="inline-flex h-11 items-center justify-center gap-2 bg-primary-800 px-5 text-sm font-semibold text-white transition hover:bg-primary-900 disabled:cursor-not-allowed disabled:bg-slate-300">{working ? <span className="size-4 animate-spin border-2 border-white/40 border-t-white" /> : <ArrowLeftRight className="size-4" />}{working ? 'กำลังสร้าง…' : 'สร้างใบโอนสินค้า'}</button></div></footer></aside></div> : null}

    {active ? <TransferActionDialog active={active} quantities={quantities} setQuantities={setQuantities} carrier={carrier} setCarrier={setCarrier} vehicle={vehicle} setVehicle={setVehicle} note={note} setNote={setNote} working={working} onClose={() => setActive(null)} onSubmit={() => void submitAction()} /> : null}<CommerceConfirmDialog open={confirmClose} title="ยังมีข้อมูลการโอนที่ยังไม่ได้บันทึก" message="ถ้าปิดตอนนี้ รายการที่กรอกไว้จะหายไป ต้องการออกจากหน้าต่างนี้หรือไม่" confirmLabel="ออกโดยไม่บันทึก" cancelLabel="กลับไปแก้ไข" onCancel={() => setConfirmClose(false)} onConfirm={() => { setConfirmClose(false); resetCreateForm(); }} />
  </main></CommerceShell>;
}

function TransferActionDialog({ active, quantities, setQuantities, carrier, setCarrier, vehicle, setVehicle, note, setNote, working, onClose, onSubmit }: { active: TransferAction; quantities: Record<string, { shipped: string; received: string; damaged: string }>; setQuantities: Dispatch<SetStateAction<Record<string, { shipped: string; received: string; damaged: string }>>>; carrier: string; setCarrier: (value: string) => void; vehicle: string; setVehicle: (value: string) => void; note: string; setNote: (value: string) => void; working: boolean; onClose: () => void; onSubmit: () => void }) {
  return <div className="fixed inset-0 z-[60] flex justify-end bg-slate-950/35"><button type="button" aria-label="ปิดหน้าต่าง" onClick={onClose} className="absolute inset-0 cursor-default" /><section role="dialog" aria-modal="true" aria-labelledby="transfer-action-title" className="relative flex h-dvh w-full max-w-2xl flex-col bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-7"><div><div className="flex items-center gap-2 text-primary-800"><Truck className="size-4" /><span className="text-xs font-semibold">ดำเนินการโอนสินค้า</span></div><h2 id="transfer-action-title" className="mt-1 text-xl font-semibold text-slate-950">{active.action === 'ship' ? 'Pick / Pack / Ship' : 'ตรวจรับสินค้า'} <span className="font-normal text-slate-400">· {active.transfer.transfer_number}</span></h2><p className="mt-1 text-sm text-slate-500">{active.action === 'ship' ? 'ระบุจำนวนที่ส่งจริง ระบบจะตัดสต๊อกเมื่อยืนยัน' : 'ระบุจำนวนรับดีและจำนวนเสียหายให้ครบก่อนปิดใบโอน'}</p></div><button type="button" onClick={onClose} aria-label="ปิด" className="grid size-10 place-items-center text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X className="size-5" /></button></header><div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7"><div className="border border-slate-200"><table className="w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-3 text-left">สินค้า / หน่วย</th><th className="px-3 py-3 text-right">{active.action === 'ship' ? 'จำนวนส่ง' : 'รับดี'}</th>{active.action === 'receive' ? <th className="px-3 py-3 text-right">เสียหาย</th> : null}</tr></thead><tbody>{active.transfer.stock_transfer_items.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-3 py-3"><p className="font-medium text-slate-900">{item.products?.name || item.product_id}</p><p className="mt-1 text-xs text-slate-500">{active.action === 'ship' ? `ขอ ${formatQuantity(item.quantity_requested)}` : `ส่งมา ${formatQuantity(item.quantity_shipped)}`} · {item.product_units?.name || 'หน่วย'}</p></td><td className="px-3 py-3 text-right"><input aria-label={`${active.action === 'ship' ? 'จำนวนส่ง' : 'จำนวนรับดี'} ${item.products?.name || item.product_id}`} type="number" min="0" max={active.action === 'ship' ? toNumber(item.quantity_requested) : toNumber(item.quantity_shipped)} step="0.001" value={active.action === 'ship' ? quantities[item.id]?.shipped : quantities[item.id]?.received} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: { ...current[item.id], [active.action === 'ship' ? 'shipped' : 'received']: event.target.value } }))} className="h-10 w-28 border border-slate-300 px-2 text-right outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100" /></td>{active.action === 'receive' ? <td className="px-3 py-3 text-right"><input aria-label={`จำนวนเสียหาย ${item.products?.name || item.product_id}`} type="number" min="0" max={toNumber(item.quantity_shipped)} step="0.001" value={quantities[item.id]?.damaged} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: { ...current[item.id], damaged: event.target.value } }))} className="h-10 w-28 border border-slate-300 px-2 text-right outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100" /></td> : null}</tr>)}</tbody></table></div>{active.action === 'ship' ? <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">ผู้ขนส่ง <span className="font-normal text-slate-400">(ไม่บังคับ)</span><input value={carrier} onChange={(event) => setCarrier(event.target.value)} className="mt-1.5 h-11 w-full border border-slate-300 px-3 text-sm font-normal outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100" /></label><label className="text-sm font-medium text-slate-700">ทะเบียนรถ <span className="font-normal text-slate-400">(ไม่บังคับ)</span><input value={vehicle} onChange={(event) => setVehicle(event.target.value)} className="mt-1.5 h-11 w-full border border-slate-300 px-3 text-sm font-normal outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100" /></label></div> : <label className="mt-4 block text-sm font-medium text-slate-700">หมายเหตุส่วนต่าง <span className="font-normal text-slate-400">(ไม่บังคับ)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-1.5 min-h-24 w-full resize-y border border-slate-300 p-3 text-sm font-normal outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100" placeholder="ระบุกรณีของขาด เกิน หรือเสียหาย" /></label>}<div className="mt-4 flex items-start gap-2 border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600"><CircleHelp className="mt-0.5 size-4 shrink-0 text-slate-500" /><span>ตรวจสอบหน่วยและจำนวนให้ตรงกับของจริงก่อนยืนยัน ระบบจะบันทึก movement ตามหน่วยที่เลือกไว้ในใบนี้</span></div></div><footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 sm:px-7"><button type="button" onClick={onClose} disabled={working} className="h-11 border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button><button type="button" disabled={working} onClick={onSubmit} className="h-11 bg-primary-800 px-5 text-sm font-semibold text-white hover:bg-primary-900 disabled:cursor-wait disabled:bg-slate-300">{working ? 'กำลังบันทึก…' : active.action === 'ship' ? 'ยืนยันส่งสินค้า' : 'ยืนยันผลตรวจรับ'}</button></footer></section></div>;
}
