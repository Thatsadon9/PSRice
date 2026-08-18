'use client';

import Select from '@/components/ui/Select';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CommerceShell } from '@/components/commerce/CommerceShell';
import { CommerceInitialState } from '@/components/commerce/CommerceInitialState';
import { getAccessToken } from '@/lib/supabase';

type Branch = { id: string; name: string };
type Category = { id: string; name: string };
type Product = { id: string; sku: string; barcode: string | null; name: string; category_id: string | null; is_active: boolean };
type Override = { branch_id: string; product_id: string; is_active: boolean; updated_at: string };
type AvailabilityData = { branches: Branch[]; categories: Category[]; products: Product[]; overrides: Override[] };

async function commerceFetch(path: string, init?: RequestInit) {
  const accessToken = await getAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'ทำรายการไม่สำเร็จ');
  return body;
}

export default function BranchCatalogAvailabilityWorkspace() {
  const [data, setData] = useState<AvailabilityData | null>(null);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [branchForBulk, setBranchForBulk] = useState('');
  const [status, setStatus] = useState('กำลังโหลดรายการสินค้า…');
  const [workingKey, setWorkingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus('กำลังโหลดรายการสินค้า…');
      const response = await commerceFetch('/api/commerce/catalog/availability') as AvailabilityData;
      setData(response);
      setBranchForBulk((current) => current || response.branches[0]?.id || '');
      setStatus(`สินค้า ${response.products.length} รายการ · สินค้าใหม่เปิดขายทุกสาขาโดยอัตโนมัติ`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'ไม่สามารถโหลดการตั้งค่าได้');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const disabledKeys = useMemo(
    () => new Set((data?.overrides || []).filter((item) => !item.is_active).map((item) => `${item.branch_id}:${item.product_id}`)),
    [data?.overrides],
  );
  const categoryNames = useMemo(() => new Map((data?.categories || []).map((category) => [category.id, category.name])), [data?.categories]);
  const visibleProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (data?.products || []).filter((product) => {
      const categoryMatch = !categoryId || product.category_id === categoryId;
      const searchMatch = !query || `${product.name} ${product.sku} ${product.barcode || ''}`.toLocaleLowerCase().includes(query);
      return categoryMatch && searchMatch;
    });
  }, [categoryId, data?.products, search]);

  const updateLocalState = (branchId: string, productIds: string[], isActive: boolean) => {
    setData((current) => {
      if (!current) return current;
      const targets = new Set(productIds);
      const remaining = current.overrides.filter((item) => !(item.branch_id === branchId && targets.has(item.product_id)));
      return {
        ...current,
        overrides: isActive
          ? remaining
          : [...remaining, ...productIds.map((productId) => ({ branch_id: branchId, product_id: productId, is_active: false, updated_at: new Date().toISOString() }))],
      };
    });
  };

  const changeAvailability = async (branchId: string, productIds: string[], isActive: boolean, label: string) => {
    if (!productIds.length) return;
    const key = `${branchId}:${productIds.length === 1 ? productIds[0] : 'bulk'}`;
    try {
      setWorkingKey(key);
      await commerceFetch('/api/commerce/catalog/availability', {
        method: 'PUT',
        body: JSON.stringify({ branch_id: branchId, product_ids: productIds, is_active: isActive }),
      });
      updateLocalState(branchId, productIds, isActive);
      setStatus(isActive ? `เปิดขาย ${label} แล้ว` : `หยุดขาย ${label} แล้ว`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'บันทึกการตั้งค่าไม่สำเร็จ');
    } finally {
      setWorkingKey(null);
    }
  };

  const activeVisibleProductIds = visibleProducts.filter((product) => product.is_active).map((product) => product.id);
  const availableCount = (productId: string) => (data?.branches || []).reduce((count, branch) => count + (disabledKeys.has(`${branch.id}:${productId}`) ? 0 : 1), 0);

  if (!data) {
    return <CommerceShell section="catalog-availability"><main className="mx-auto max-w-[1680px] px-3 py-5 sm:px-5"><CommerceInitialState status={status} onRetry={() => void load()} label="กำลังโหลดรายการสินค้าและสาขา…" /></main></CommerceShell>;
  }

  return (
    <CommerceShell section="catalog-availability">
      <main className="mx-auto max-w-[1680px] px-3 py-5 sm:px-5">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-medium text-primary-800">Commerce / Catalog</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">กำหนดสินค้าที่วางขายตามสาขา</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">ใช้แคตตาล็อกกลางชุดเดียว สินค้าใหม่จะเปิดขายในทุกสาขาโดยอัตโนมัติ และใช้สวิตช์ด้านล่างเพื่อปิดเฉพาะสาขาที่ไม่มีขาย</p>
          </div>
          <p className="text-xs text-slate-500">{status}</p>
        </header>

        <section className="mt-5 border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
            <label className="min-w-56 flex-1 text-xs font-medium text-slate-600">
              ค้นหาสินค้า
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ชื่อสินค้า, SKU หรือบาร์โค้ด" className="mt-1 h-10 w-full border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-primary-700" />
            </label>
            <label className="w-48 text-xs font-medium text-slate-600">
              หมวดสินค้า
              <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1 h-10 w-full border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:border-primary-700">
                <option value="">ทุกหมวด</option>
                {data?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </Select>
            </label>
            <p className="self-end pb-2 text-xs text-slate-500">แสดง {visibleProducts.length} รายการ</p>
          </div>

          <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-slate-700">ปรับทั้งผลการค้นหา</p>
              <p className="mt-0.5 text-xs text-slate-500">ปรับสถานะการขายหลายรายการในสาขาปัจจุบัน</p>
            </div>
            <label className="w-52 text-xs font-medium text-slate-600">
              สาขา
              <Select value={branchForBulk} onChange={(event) => setBranchForBulk(event.target.value)} className="mt-1 h-9 w-full border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:border-primary-700">
                {data?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </Select>
            </label>
            <div className="flex gap-2 self-end">
              <button type="button" disabled={!branchForBulk || !activeVisibleProductIds.length || workingKey !== null} onClick={() => void changeAvailability(branchForBulk, activeVisibleProductIds, true, `สินค้า ${activeVisibleProductIds.length} รายการในผลลัพธ์`)} className="h-9 border border-primary-700 bg-white px-3 text-xs font-medium text-primary-800 hover:bg-primary-50 disabled:border-slate-200 disabled:text-slate-400">เปิดขายทั้งหมด</button>
              <button type="button" disabled={!branchForBulk || !activeVisibleProductIds.length || workingKey !== null} onClick={() => void changeAvailability(branchForBulk, activeVisibleProductIds, false, `สินค้า ${activeVisibleProductIds.length} รายการในผลลัพธ์`)} className="h-9 border border-slate-400 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400">หยุดขายทั้งหมด</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
              <thead className="bg-white text-xs font-medium text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="sticky left-0 z-10 min-w-28 bg-white px-4 py-3">SKU</th>
                  <th className="sticky left-28 z-10 min-w-72 bg-white px-4 py-3">สินค้า</th>
                  <th className="min-w-28 px-4 py-3 text-center">วางขาย</th>
                  {data?.branches.map((branch) => <th key={branch.id} className="min-w-36 px-3 py-3 text-center">{branch.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {visibleProducts.map((product) => (
                  <tr key={product.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 text-xs text-slate-500 group-hover:bg-slate-50">{product.sku}</td>
                    <td className="sticky left-28 z-10 bg-white px-4 py-3 group-hover:bg-slate-50">
                      <p className="font-medium text-slate-900">{product.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{product.category_id ? categoryNames.get(product.category_id) || 'ไม่ระบุหมวด' : 'ไม่ระบุหมวด'}{!product.is_active && ' · ปิดสินค้าในระบบกลาง'}</p>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-600">{product.is_active ? `${availableCount(product.id)}/${data?.branches.length || 0} สาขา` : 'ปิดทั้งระบบ'}</td>
                    {data?.branches.map((branch) => {
                      const key = `${branch.id}:${product.id}`;
                      const isActive = product.is_active && !disabledKeys.has(key);
                      const isWorking = workingKey === key;
                      return <td key={branch.id} className="px-3 py-3 text-center">
                        <button type="button" role="switch" aria-checked={isActive} aria-label={`${isActive ? 'หยุดขาย' : 'เปิดขาย'} ${product.name} ที่ ${branch.name}`} disabled={!product.is_active || workingKey !== null} onClick={() => void changeAvailability(branch.id, [product.id], !isActive, `${product.name} ที่ ${branch.name}`)} className={`relative h-6 w-11 rounded-full transition ${isActive ? 'bg-primary-800' : 'bg-slate-300'} disabled:cursor-not-allowed disabled:opacity-45`}>
                          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${isActive ? 'left-6' : 'left-1'}`} />
                          <span className="sr-only">{isWorking ? 'กำลังบันทึก' : isActive ? 'กำลังวางขาย' : 'ไม่ได้วางขาย'}</span>
                        </button>
                        <p className={`mt-1 text-[11px] ${isActive ? 'text-primary-800' : 'text-slate-400'}`}>{isWorking ? 'บันทึก…' : isActive ? 'ขาย' : 'ไม่ขาย'}</p>
                      </td>;
                    })}
                  </tr>
                ))}
                {!visibleProducts.length && <tr><td colSpan={(data?.branches.length || 0) + 3} className="px-4 py-16 text-center text-sm text-slate-500">ไม่พบสินค้าที่ตรงกับเงื่อนไข</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </CommerceShell>
  );
}
