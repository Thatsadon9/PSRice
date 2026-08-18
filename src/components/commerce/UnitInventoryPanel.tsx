'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronDown, LoaderCircle, RefreshCw, Scale, TriangleAlert, X } from 'lucide-react';
import { getAccessToken } from '@/lib/supabase';
import { toNumber } from '@/lib/commerce';
import CommerceUnitPicker from '@/components/commerce/CommerceUnitPicker';
import type { CommerceUnit } from '@/lib/commerce';

type UnitBalance = {
  id: string;
  name: string;
  code: string;
  conversion_to_base: number | string;
  is_default: boolean;
  allow_decimal: boolean;
  can_sell: boolean;
  can_receive: boolean;
  image_url: string | null;
  on_hand: number;
  reserved: number;
  damaged: number;
  in_transit: number;
  available: number;
};

type UnitInventoryResponse = {
  branchId: string;
  product: { id: string; name: string; sku: string; base_unit_code: string; unit_inventory_mode: string; image_url: string | null };
  units: UnitBalance[];
};

async function fetchUnitInventory(productId: string, branchId: string) {
  const token = await getAccessToken();
  const response = await fetch(`/api/commerce/inventory/units?product_id=${encodeURIComponent(productId)}&branch_id=${encodeURIComponent(branchId)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'โหลดสต๊อกตามหน่วยไม่สำเร็จ');
  return body as UnitInventoryResponse;
}

async function saveUnitInventory(productId: string, branchId: string, body: Record<string, unknown>) {
  const token = await getAccessToken();
  const response = await fetch('/api/commerce/inventory/units', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ product_id: productId, branch_id: branchId, ...body }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'บันทึกสต๊อกตามหน่วยไม่สำเร็จ');
  return result;
}

function quantity(value: number) {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 3 });
}

export default function UnitInventoryPanel({ productId, branchId, canConfigure, onChanged }: { productId: string; branchId: string; canConfigure: boolean; onChanged?: () => void }) {
  const [data, setData] = useState<UnitInventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [conversionOpen, setConversionOpen] = useState(false);
  const [sourceUnitId, setSourceUnitId] = useState('');
  const [targetUnitId, setTargetUnitId] = useState('');
  const [sourceQuantity, setSourceQuantity] = useState('1');
  const [saving, setSaving] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustReason, setAdjustReason] = useState('ตรวจนับสินค้า');

  const load = useCallback(async (quiet = false) => {
    try {
      if (quiet) setRefreshing(true); else setLoading(true);
      setMessage('');
      const response = await fetchUnitInventory(productId, branchId);
      setData(response);
      setSourceUnitId((current) => current || response.units[0]?.id || '');
      setTargetUnitId((current) => current || response.units[1]?.id || response.units[0]?.id || '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'โหลดสต๊อกตามหน่วยไม่สำเร็จ');
    } finally { setLoading(false); setRefreshing(false); }
  }, [branchId, productId]);

  useEffect(() => { void load(); }, [load]);

  const source = data?.units.find((unit) => unit.id === sourceUnitId);
  const target = data?.units.find((unit) => unit.id === targetUnitId);
  const targetQuantity = source && target ? toNumber(sourceQuantity) * toNumber(source.conversion_to_base) / Math.max(0.001, toNumber(target.conversion_to_base)) : 0;
  const canConvert = Boolean(canConfigure && source && target && source.id !== target.id && toNumber(sourceQuantity) > 0 && toNumber(sourceQuantity) <= source.available && targetQuantity > 0);
  const totalBase = useMemo(() => (data?.units || []).reduce((sum, unit) => sum + unit.on_hand * toNumber(unit.conversion_to_base), 0), [data]);
  const pickerUnits = useMemo<CommerceUnit[]>(() => (data?.units || []).map((unit) => ({
    id: unit.id,
    code: unit.code,
    name: unit.name,
    barcode: null,
    imageUrl: unit.image_url || data?.product.image_url || null,
    conversionToBase: toNumber(unit.conversion_to_base),
    isDefault: unit.is_default,
    canSell: unit.can_sell,
    canReceive: unit.can_receive,
    available: unit.available,
    onHand: unit.on_hand,
    reserved: unit.reserved,
    damaged: unit.damaged,
    salePrice: 0,
    priceReason: '',
  })), [data]);

  const convert = async () => {
    if (!canConvert || !source || !target) return;
    try {
      setSaving(true);
      await saveUnitInventory(productId, branchId, { action: 'convert', source_unit_id: source.id, source_quantity: toNumber(sourceQuantity), target_unit_id: target.id, note: `แปลง ${source.name} เป็น ${target.name}` });
      setConversionOpen(false);
      setSourceQuantity('1');
      await load(true);
      onChanged?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'แปลงหน่วยไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  const adjust = async (unit: UnitBalance) => {
    const next = Number(adjustQuantity);
    if (!canConfigure || !Number.isFinite(next) || next < 0 || !adjustReason.trim()) return;
    try {
      setSaving(true);
      await saveUnitInventory(productId, branchId, { action: 'adjust', product_unit_id: unit.id, quantity_after: next, reason: adjustReason, note: 'ปรับยอดจากหน้าสต๊อกตามหน่วย' });
      setEditingUnitId(null);
      await load(true);
      onChanged?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'ปรับยอดหน่วยไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  if (loading && !data) return <section className="border border-slate-200 bg-slate-50 p-5"><div className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin text-primary-700" />กำลังโหลดสต๊อกแยกตามหน่วย…</div></section>;
  if (!data) return <section className="border border-red-200 bg-red-50 p-5 text-sm text-red-800">{message || 'ไม่สามารถโหลดสต๊อกตามหน่วยได้'}</section>;

  return <section className="border border-slate-200 bg-white">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center bg-primary-50 text-primary-800"><Scale className="size-4" /></span><div><h3 className="text-sm font-semibold text-slate-950">สต๊อกแยกตามหน่วยจริง</h3><p className="mt-1 text-xs leading-5 text-slate-500">ขาย รับเข้า และแปลงหน่วยโดยไม่ทำให้จำนวนกระสอบ/ถุง/กิโลปนกัน</p></div></div>
      <div className="flex items-center gap-2"><span className="text-xs text-slate-500">รวม {quantity(totalBase)} {data.product.base_unit_code}</span><button type="button" onClick={() => void load(true)} disabled={refreshing} className="grid size-8 place-items-center border border-slate-300 bg-white text-slate-500 hover:text-primary-800 disabled:opacity-50" aria-label="อัปเดตสต๊อก"><RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} /></button></div>
    </header>
    {message ? <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-800"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{message}</div> : null}
    <div className="divide-y divide-slate-100">
      {data.units.map((unit) => <div key={unit.id} className="px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-slate-900">{unit.name}</p>{unit.is_default ? <span className="bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-800">หน่วยหลัก</span> : null}</div><p className="mt-1 text-xs text-slate-500">1 {unit.name} = {quantity(toNumber(unit.conversion_to_base))} {data.product.base_unit_code} · {unit.can_sell ? 'ขายได้' : 'ไม่ขาย'} · {unit.can_receive ? 'รับเข้าได้' : 'ไม่รับเข้า'}</p></div><div className="text-right"><p className="text-lg font-semibold tabular-nums text-slate-950">{quantity(unit.available)}</p><p className="text-[11px] text-slate-500">พร้อมขาย {unit.name}</p></div>{canConfigure ? <button type="button" onClick={() => { setEditingUnitId((current) => current === unit.id ? null : unit.id); setAdjustQuantity(String(unit.on_hand)); setAdjustReason('ตรวจนับสินค้า'); }} className="grid size-8 place-items-center text-slate-400 hover:bg-slate-100 hover:text-primary-800" aria-label={`ปรับยอด ${unit.name}`}><Scale className="size-4" /></button> : null}</div>
        {unit.reserved || unit.damaged || unit.in_transit ? <p className="mt-2 text-[11px] text-slate-400">มีจริง {quantity(unit.on_hand)} · จอง {quantity(unit.reserved)} · เสียหาย {quantity(unit.damaged)}{unit.in_transit ? ` · ระหว่างโอน ${quantity(unit.in_transit)}` : ''}</p> : null}
        {editingUnitId === unit.id ? <div className="mt-3 grid gap-3 border-l-2 border-primary-700 bg-primary-50/50 p-3 sm:grid-cols-[1fr_1fr_auto]"><label className="text-xs font-medium text-slate-700">ยอดจริงใหม่<input type="number" min="0" step={unit.allow_decimal ? '0.001' : '1'} value={adjustQuantity} onChange={(event) => setAdjustQuantity(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700" /></label><label className="text-xs font-medium text-slate-700">เหตุผล<select value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700"><option>ตรวจนับสินค้า</option><option>สินค้าสูญหาย</option><option>สินค้าเสียหาย</option><option>แก้ไขยอดยกมา</option></select></label><div className="flex items-end gap-2"><button type="button" onClick={() => setEditingUnitId(null)} className="grid size-10 place-items-center border border-slate-300 bg-white text-slate-500" aria-label="ยกเลิก"><X className="size-4" /></button><button type="button" onClick={() => void adjust(unit)} disabled={saving} className="inline-flex h-10 items-center gap-1 bg-primary-800 px-3 text-xs font-semibold text-white disabled:bg-slate-300"><Check className="size-3.5" />บันทึก</button></div></div> : null}
      </div>)}
    </div>
    {canConfigure ? <div className="border-t border-slate-200 px-4 py-4 sm:px-5"><button type="button" onClick={() => setConversionOpen((current) => !current)} className="inline-flex h-10 items-center gap-2 border border-primary-700 px-4 text-sm font-semibold text-primary-800 hover:bg-primary-50"><ArrowRight className="size-4" />แปลง / ย้ายหน่วย<ChevronDown className={`size-4 transition-transform ${conversionOpen ? 'rotate-180' : ''}`} /></button>{conversionOpen ? <div className="mt-4 border border-primary-100 bg-primary-50/40 p-4"><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)] sm:items-end"><label className="text-xs font-medium text-slate-700">จากหน่วย<CommerceUnitPicker units={pickerUnits} value={sourceUnitId} onValueChange={(value) => setSourceUnitId(value)} placeholder="เลือกหน่วยต้นทาง" className="mt-1.5 h-10 w-full" /></label><label className="text-xs font-medium text-slate-700">จำนวน<input type="number" min="0.001" step="0.001" value={sourceQuantity} onChange={(event) => setSourceQuantity(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-right text-sm" /></label><label className="text-xs font-medium text-slate-700">เป็นหน่วย<CommerceUnitPicker units={pickerUnits} value={targetUnitId} onValueChange={(value) => setTargetUnitId(value)} placeholder="เลือกหน่วยปลายทาง" className="mt-1.5 h-10 w-full" /></label></div><div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-3"><p className="text-sm text-primary-950">ผลลัพธ์: <strong>{quantity(toNumber(sourceQuantity))} {source?.name || 'หน่วย'}</strong> <ArrowRight className="mx-1 inline size-4" /> <strong>{quantity(targetQuantity)} {target?.name || 'หน่วย'}</strong></p><button type="button" onClick={() => void convert()} disabled={!canConvert || saving} className="inline-flex h-10 items-center gap-2 bg-primary-800 px-4 text-sm font-semibold text-white disabled:bg-slate-300">{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}ยืนยันแปลงหน่วย</button></div></div> : null}</div> : null}
  </section>;
}
