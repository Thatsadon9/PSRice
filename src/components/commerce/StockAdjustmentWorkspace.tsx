'use client';

import CommerceProductPicker from '@/components/commerce/CommerceProductPicker';
import CommerceUnitPicker from '@/components/commerce/CommerceUnitPicker';
import { CommerceShell } from '@/components/commerce/CommerceShell';
import { CommerceBootstrap, toNumber } from '@/lib/commerce';
import { getAccessToken } from '@/lib/supabase';
import { FormEvent, useCallback, useEffect, useState } from 'react';

async function request(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body;
}

export default function StockAdjustmentWorkspace() {
  const [data, setData] = useState<CommerceBootstrap | null>(null);
  const [productId, setProductId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [actual, setActual] = useState('');
  const [reason, setReason] = useState('ตรวจนับสินค้า');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('กำลังโหลดสินค้า…');
  const [working, setWorking] = useState(false);

  const load = useCallback(async (branch?: string) => {
    try {
      const bootstrap = await request(`/api/commerce/bootstrap${branch ? `?branch_id=${encodeURIComponent(branch)}` : ''}`) as CommerceBootstrap;
      setData(bootstrap);
      setStatus('เลือกสินค้าและบันทึกยอดจริง');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'โหลดไม่สำเร็จ');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = data?.products.find((product) => product.id === productId);
  const separateUnits = selected?.unitInventoryMode === 'separate_unit';
  const selectedUnit = selected?.units.find((unit) => unit.id === unitId);
  const selectProduct = (nextProductId: string) => {
    const product = data?.products.find((item) => item.id === nextProductId);
    setProductId(nextProductId);
    setUnitId(product?.unitInventoryMode === 'separate_unit'
      ? product.units.find((unit) => unit.isDefault)?.id || product.units[0]?.id || ''
      : '');
    setActual('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!data || !productId || (separateUnits && !unitId)) return;
    try {
      setWorking(true);
      const result = await request('/api/commerce/stock-adjustments', {
        method: 'POST',
        body: JSON.stringify({
          branch_id: data.branchId,
          product_id: productId,
          ...(separateUnits ? { product_unit_id: unitId } : {}),
          quantity_after: actual,
          reason,
          note,
        }),
      }) as { result: { delta?: number; quantity_delta?: number } };
      setActual('');
      setNote('');
      await load(data.branchId);
      const delta = result.result.delta ?? result.result.quantity_delta ?? 0;
      setStatus(`บันทึกส่วนต่าง ${toNumber(delta).toLocaleString('th-TH')} ${selectedUnit?.name || selected?.baseUnitCode || 'หน่วย'} แล้ว`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setWorking(false);
    }
  };

  return (
    <CommerceShell section="backoffice">
      <main className="mx-auto max-w-3xl px-4 py-5">
        <header className="border-b border-slate-200 pb-4">
          <p className="text-xs font-medium text-primary-800">Commerce / Inventory</p>
          <h1 className="mt-1 text-2xl font-semibold">ตรวจนับและปรับสต๊อก</h1>
          <p className="mt-1 text-sm text-slate-500">{status}</p>
        </header>
        <form onSubmit={submit} className="mt-5 border border-slate-200 bg-white p-5">
          <label className="block text-xs font-medium">สินค้า
            <CommerceProductPicker products={data?.products || []} value={productId} onValueChange={selectProduct} placeholder="เลือกสินค้า" className="mt-1.5 h-10 w-full" />
          </label>
          {selected && separateUnits ? (
            <label className="mt-4 block text-xs font-medium">หน่วยที่ต้องการปรับ
              <CommerceUnitPicker units={selected.units} product={selected} value={unitId} onValueChange={(nextUnitId) => { setUnitId(nextUnitId); setActual(''); }} placeholder="เลือกหน่วย" showStock className="mt-1.5 h-10 w-full" />
            </label>
          ) : null}
          {selected ? <p className="mt-2 text-xs text-slate-500">ยอดพร้อมขายตามระบบ: {selected.available.toLocaleString('th-TH')} {selected.baseUnitCode}{separateUnits && selectedUnit ? ` · ${selectedUnit.name} แยกจากหน่วยอื่น` : ''}</p> : null}
          <label className="mt-4 block text-xs font-medium">ยอดจริงที่นับได้ ({selectedUnit?.name || selected?.baseUnitCode || 'หน่วย'})
            <input required min="0" step="0.001" type="number" value={actual} onChange={(event) => setActual(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm" />
          </label>
          <label className="mt-4 block text-xs font-medium">เหตุผล
            <input required value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm" />
          </label>
          <label className="mt-4 block text-xs font-medium">หมายเหตุ
            <textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-1.5 w-full border border-slate-300 p-3 text-sm" rows={3} />
          </label>
          <button disabled={working || !productId || (separateUnits && !unitId)} className="mt-5 h-10 bg-primary-800 px-5 text-sm font-medium text-white disabled:bg-slate-300">{working ? 'กำลังบันทึก…' : 'ยืนยันปรับสต๊อก'}</button>
        </form>
      </main>
    </CommerceShell>
  );
}
