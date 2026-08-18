'use client';

import Image from 'next/image';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  LoaderCircle,
  PackageOpen,
  Pencil,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Store,
  TriangleAlert,
  Warehouse,
  X,
} from 'lucide-react';
import { CommerceShell, getCachedCommerceBranchId } from '@/components/commerce/CommerceShell';
import { CommerceInitialState } from '@/components/commerce/CommerceInitialState';
import UnitInventoryPanel from '@/components/commerce/UnitInventoryPanel';
import Select from '@/components/ui/Select';
import { formatBaht, toNumber } from '@/lib/commerce';
import { getAccessToken } from '@/lib/supabase';

type InventoryStatus = 'normal' | 'low' | 'out' | 'inactive';

type InventoryItem = {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  name: string;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  unitId: string | null;
  unitName: string;
  unitCode: string;
  unitInventoryMode: 'shared_base' | 'separate_unit';
  salePrice: number;
  costPrice: number;
  reorderPoint: number;
  onHand: number;
  reserved: number;
  damaged: number;
  inTransit: number;
  available: number;
  isActive: boolean;
  productIsActive: boolean;
  status: InventoryStatus;
  note: string;
  updatedAt: string | null;
};

type InventoryData = {
  branch: { id: string; code: string | null; name: string };
  categories: Array<{ id: string; name: string }>;
  items: InventoryItem[];
  summary: InventorySummary;
  capabilities: { canAdjust: boolean; canManagePricing: boolean };
};

type InventorySummary = {
  onHand: number;
  available: number;
  stockValue: number;
  expectedProfit: number;
  lowStock: number;
  outOfStock: number;
};

type AvailabilityBranch = { id: string; code: string | null; name: string };
type AvailabilityOverride = { branch_id: string; product_id: string; is_active: boolean; updated_at: string };
type AvailabilityData = {
  branches: AvailabilityBranch[];
  products: Array<{ id: string; is_active: boolean }>;
  overrides: AvailabilityOverride[];
};

type EditForm = {
  salePrice: string;
  costPrice: string;
  reorderPoint: string;
  quantityAfter: string;
  isActive: string;
  note: string;
  stockReason: string;
};

const pageSizeOptions = [25, 50, 100];
const statusLabels: Record<InventoryStatus, string> = {
  normal: 'ปกติ',
  low: 'ใกล้ถึงจุดสั่งซื้อ',
  out: 'สินค้าหมด',
  inactive: 'หยุดขาย',
};
const INVENTORY_CACHE_TTL = 60_000;
const INVENTORY_CACHE_LIMIT = 8;
const inventoryCache = new Map<string, { value: InventoryData; savedAt: number }>();
const inventoryRequests = new Map<string, Promise<InventoryData>>();

async function commerceFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'ทำรายการไม่สำเร็จ');
  return body;
}

function readInventoryCache(branchId: string | null) {
  if (!branchId) return null;
  const entry = inventoryCache.get(branchId) || null;
  if (entry) {
    inventoryCache.delete(branchId);
    inventoryCache.set(branchId, entry);
  }
  return entry;
}

function rememberInventory(value: InventoryData) {
  inventoryCache.delete(value.branch.id);
  inventoryCache.set(value.branch.id, { value, savedAt: Date.now() });
  while (inventoryCache.size > INVENTORY_CACHE_LIMIT) {
    const oldestKey = inventoryCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    inventoryCache.delete(oldestKey);
  }
}

function invalidateInventory(branchId?: string | null) {
  if (branchId) inventoryCache.delete(branchId);
  else inventoryCache.clear();
}

async function requestInventory(branchId: string | null) {
  const requestKey = branchId || 'selected-branch';
  const pending = inventoryRequests.get(requestKey);
  if (pending) return pending;

  const promise = (commerceFetch('/api/commerce/inventory') as Promise<InventoryData>)
    .then((response) => {
      rememberInventory(response);
      return response;
    })
    .finally(() => inventoryRequests.delete(requestKey));
  inventoryRequests.set(requestKey, promise);
  return promise;
}

function formFromItem(item: InventoryItem): EditForm {
  return {
    salePrice: String(item.salePrice),
    costPrice: String(item.costPrice),
    reorderPoint: String(item.reorderPoint),
    quantityAfter: String(item.onHand),
    isActive: item.isActive ? 'active' : 'inactive',
    note: item.note,
    stockReason: '',
  };
}

function inventoryStatus(item: InventoryItem, isActive: boolean): InventoryStatus {
  if (!isActive) return 'inactive';
  if (item.available <= 0) return 'out';
  if (item.available <= item.reorderPoint) return 'low';
  return 'normal';
}

function summarizeInventory(items: InventoryItem[]): InventorySummary {
  return items.reduce((current, item) => {
    current.onHand += item.onHand;
    current.available += item.available;
    current.stockValue += item.onHand * item.costPrice;
    current.expectedProfit += item.available * Math.max(0, item.salePrice - item.costPrice);
    if (item.status === 'low') current.lowStock += 1;
    if (item.status === 'out') current.outOfStock += 1;
    return current;
  }, { onHand: 0, available: 0, stockValue: 0, expectedProfit: 0, lowStock: 0, outOfStock: 0 });
}

export default function InventoryManagementWorkspace() {
  const initialCache = readInventoryCache(getCachedCommerceBranchId());
  const [data, setData] = useState<InventoryData | null>(() => initialCache?.value || null);
  const [loading, setLoading] = useState(() => !initialCache);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState(() => initialCache
    ? `ข้อมูลล่าสุด · ${initialCache.value.items.length.toLocaleString('th-TH')} รายการในสาขา ${initialCache.value.branch.name}`
    : 'กำลังโหลดข้อมูลสต๊อก…');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (quiet = false, force = false) => {
    const branchId = getCachedCommerceBranchId();
    const cached = readInventoryCache(branchId);
    if (cached) {
      setData(cached.value);
      setStatus(`ข้อมูลล่าสุด · ${cached.value.items.length.toLocaleString('th-TH')} รายการในสาขา ${cached.value.branch.name}`);
      setLoading(false);
      if (!force && Date.now() - cached.savedAt < INVENTORY_CACHE_TTL) return;
    }

    try {
      if (!cached && !quiet) setLoading(true);
      else setRefreshing(true);
      if (!cached) setStatus(quiet ? 'กำลังอัปเดตข้อมูล…' : 'กำลังโหลดข้อมูลสต๊อก…');
      const response = await requestInventory(branchId);
      setData(response);
      setStatus(`ข้อมูลล่าสุด · ${response.items.length.toLocaleString('th-TH')} รายการในสาขา ${response.branch.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'โหลดข้อมูลบริหารสต๊อกไม่สำเร็จ');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [categoryId, search, sortBy, stockFilter]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('th');
    const filtered = (data?.items || []).filter((item) => {
      const matchesSearch = !query || `${item.name} ${item.sku} ${item.barcode || ''} ${item.categoryName || ''}`.toLocaleLowerCase('th').includes(query);
      const matchesCategory = !categoryId || item.categoryId === categoryId;
      const matchesStock = stockFilter === 'all'
        || item.status === stockFilter
        || (stockFilter === 'available' && item.available > 0 && item.isActive);
      return matchesSearch && matchesCategory && matchesStock;
    });

    return filtered.sort((left, right) => {
      if (sortBy === 'sku') return left.sku.localeCompare(right.sku, 'th', { numeric: true });
      if (sortBy === 'quantity-low') return left.available - right.available;
      if (sortBy === 'quantity-high') return right.available - left.available;
      if (sortBy === 'value-high') return (right.onHand * right.costPrice) - (left.onHand * left.costPrice);
      if (sortBy === 'updated') return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
      return left.name.localeCompare(right.name, 'th');
    });
  }, [categoryId, data?.items, search, sortBy, stockFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const canConfigure = Boolean(data?.capabilities.canAdjust && data?.capabilities.canManagePricing);
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => selectedIds.has(item.id));

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleItems.forEach((item) => next.delete(item.id));
      else visibleItems.forEach((item) => next.add(item.id));
      return next;
    });
  };

  const openEditor = (item: InventoryItem) => {
    setEditing(item);
    setForm(formFromItem(item));
  };

  const updateCurrentBranchAvailability = (isActive: boolean) => {
    setForm((current) => current ? { ...current, isActive: isActive ? 'active' : 'inactive' } : current);
    setEditing((current) => current ? { ...current, isActive, status: inventoryStatus(current, isActive) } : current);
    setData((current) => {
      if (!current) return current;
      const items = current.items.map((item) => item.id === editing?.id
        ? { ...item, isActive, status: inventoryStatus(item, isActive) }
        : item);
      return { ...current, items, summary: summarizeInventory(items) };
    });
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || !form) return;
    const quantityChanged = toNumber(form.quantityAfter) !== editing.onHand;
    if (quantityChanged && !form.stockReason) {
      setStatus('กรุณาระบุเหตุผลก่อนบันทึกยอดสต๊อกใหม่');
      return;
    }

    try {
      setSaving(true);
      await commerceFetch('/api/commerce/inventory', {
        method: 'PATCH',
        body: JSON.stringify({
          product_id: editing.productId,
          ...(editing.unitInventoryMode === 'separate_unit' && editing.unitId ? { product_unit_id: editing.unitId } : {}),
          sale_price: toNumber(form.salePrice),
          cost_price: toNumber(form.costPrice),
          reorder_point: toNumber(form.reorderPoint),
          quantity_after: toNumber(form.quantityAfter),
          is_active: form.isActive === 'active',
          note: form.note,
          stock_reason: form.stockReason || null,
        }),
      });
      setEditing(null);
      setForm(null);
      invalidateInventory(data?.branch.id);
      await load(true, true);
      setStatus(`บันทึกการตั้งค่า ${editing.name} แล้ว`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'บันทึกการตั้งค่าไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const exportStock = async () => {
    if (!data) return;
    const token = await getAccessToken();
    const response = await fetch(`/api/commerce/export?type=stock&branch_id=${encodeURIComponent(data.branch.id)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setStatus(body.error || 'ส่งออก Excel ไม่สำเร็จ');
      return;
    }
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `stock-${data.branch.code || data.branch.name}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(href);
    setStatus('ส่งออกข้อมูลสต๊อกเป็น Excel แล้ว');
  };

  if (loading && !data) {
    return <CommerceShell section="inventory"><main className="mx-auto max-w-[1680px] px-3 py-5 sm:px-5"><CommerceInitialState status={status} onRetry={() => void load(false, true)} label="กำลังโหลดรายการสต๊อกของสาขา…" /></main></CommerceShell>;
  }

  if (!data) {
    return <CommerceShell section="inventory"><main className="mx-auto max-w-[1680px] px-3 py-5 sm:px-5"><CommerceInitialState status={status} onRetry={() => void load(false, true)} /></main></CommerceShell>;
  }

  const from = filteredItems.length ? ((currentPage - 1) * pageSize) + 1 : 0;
  const to = Math.min(currentPage * pageSize, filteredItems.length);

  return (
    <CommerceShell section="inventory">
      <main className="relative mx-auto max-w-[1680px] px-3 py-5 sm:px-5">
        {refreshing ? <div className="pointer-events-none absolute inset-x-3 top-0 h-0.5 overflow-hidden bg-primary-100 sm:inset-x-5"><div className="catalog-progress h-full w-1/4 bg-primary-700" /></div> : null}
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-medium text-primary-800">บริหารสต๊อก / {data.branch.name}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">บริหารสต๊อกสินค้า</h1>
            <p className="mt-1 text-sm text-slate-500">{status}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void load(true, true)} disabled={refreshing} className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />อัปเดต</button>
            <button type="button" onClick={() => void exportStock()} className="inline-flex h-10 items-center gap-2 bg-primary-800 px-4 text-sm font-semibold text-white hover:bg-primary-900"><FileSpreadsheet className="h-4 w-4" />ส่งออก Excel</button>
          </div>
        </header>

        <dl className="mt-5 grid border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-6">
          <Summary label="คงเหลือทั้งหมด" value={`${data.summary.onHand.toLocaleString('th-TH')} หน่วย`} />
          <Summary label="พร้อมขาย" value={`${data.summary.available.toLocaleString('th-TH')} หน่วย`} />
          <Summary label="มูลค่าสต๊อก" value={formatBaht(data.summary.stockValue)} />
          <Summary label="กำไรคาดการณ์" value={formatBaht(data.summary.expectedProfit)} />
          <Summary label="ใกล้จุดสั่งซื้อ" value={`${data.summary.lowStock.toLocaleString('th-TH')} รายการ`} warning={data.summary.lowStock > 0} onClick={() => setStockFilter('low')} />
          <Summary label="สินค้าหมด" value={`${data.summary.outOfStock.toLocaleString('th-TH')} รายการ`} danger={data.summary.outOfStock > 0} onClick={() => setStockFilter('out')} />
        </dl>

        <section className="mt-4 border border-slate-200 bg-white">
          <div className="grid gap-3 border-b border-slate-200 p-3 lg:grid-cols-[minmax(18rem,1fr)_15rem_13rem_13rem_auto]">
            <label className="relative block">
              <span className="sr-only">ค้นหาสินค้า</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อสินค้า SKU หรือบาร์โค้ด" className="h-10 w-full border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-primary-700" />
            </label>
            <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="h-10 w-full border border-slate-300 bg-white px-3 text-sm">
              <option value="">ทุกหมวดสินค้า</option>
              {data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </Select>
            <Select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} className="h-10 w-full border border-slate-300 bg-white px-3 text-sm">
              <option value="all">ทุกสถานะ</option>
              <option value="available">มีสินค้าพร้อมขาย</option>
              <option value="low">ใกล้จุดสั่งซื้อ</option>
              <option value="out">สินค้าหมด</option>
              <option value="inactive">หยุดขาย</option>
            </Select>
            <Select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-10 w-full border border-slate-300 bg-white px-3 text-sm">
              <option value="name">เรียงตามชื่อ</option>
              <option value="sku">เรียงตาม SKU</option>
              <option value="quantity-low">คงเหลือน้อยก่อน</option>
              <option value="quantity-high">คงเหลือมากก่อน</option>
              <option value="value-high">มูลค่าสูงก่อน</option>
              <option value="updated">อัปเดตล่าสุด</option>
            </Select>
            <div className="flex h-10 items-center justify-end gap-2 text-xs text-slate-500"><SlidersHorizontal className="h-4 w-4" />{filteredItems.length.toLocaleString('th-TH')} รายการ</div>
          </div>

          {selectedIds.size > 0 ? <div className="border-b border-primary-200 bg-primary-50 px-4 py-2 text-xs font-medium text-primary-900">เลือกไว้ {selectedIds.size.toLocaleString('th-TH')} รายการ</div> : null}

          <div className="overflow-hidden">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="w-10 px-2 py-3 text-center"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="เลือกรายการในหน้านี้ทั้งหมด" className="h-4 w-4 accent-primary-800" /></th>
                  <th className="w-16 px-2 py-3">รูป</th>
                  <th className="w-24 px-2 py-3">SKU</th>
                  <th className="px-2 py-3">สินค้า</th>
                  <th className="w-32 px-2 py-3">หมวด</th>
                  <th className="w-24 px-2 py-3 text-right">ราคาขาย</th>
                  <th className="w-20 px-2 py-3 text-right">ต้นทุน</th>
                  <th className="w-24 px-2 py-3 text-right">พร้อมขาย</th>
                  <th className="w-36 px-2 py-3">สถานะ</th>
                  <th className="w-20 px-2 py-3 text-right">คำสั่ง</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <tr key={item.id} role="button" tabIndex={0} onClick={() => openEditor(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEditor(item); } }} className="cursor-pointer border-b border-slate-100 align-middle transition-colors hover:bg-slate-100 active:bg-slate-200 focus-visible:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-300">
                    <td className="px-2 py-3 text-center"><input type="checkbox" checked={selectedIds.has(item.id)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onChange={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} aria-label={`เลือก ${item.name}`} className="h-4 w-4 accent-primary-800" /></td>
                    <td className="px-2 py-2"><ProductImage item={item} /></td>
                    <td className="break-all px-2 py-3 font-mono text-xs text-slate-600">{item.sku}</td>
                    <td className="min-w-0 px-2 py-3"><p className="break-words font-medium leading-5 text-slate-900">{item.name}</p><p className="mt-1 truncate text-xs text-slate-500">{item.barcode ? `บาร์โค้ด ${item.barcode} · ` : ''}{item.unitName}</p></td>
                    <td className="break-words px-2 py-3 text-slate-600">{item.categoryName || 'ไม่ระบุหมวด'}</td>
                    <td className="whitespace-nowrap px-2 py-3 text-right font-medium tabular-nums">{formatBaht(item.salePrice)}</td>
                    <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums text-slate-600">{formatBaht(item.costPrice)}</td>
                    <td className={`px-2 py-3 text-right font-semibold tabular-nums ${item.status === 'out' ? 'text-red-700' : item.status === 'low' ? 'text-amber-700' : 'text-slate-900'}`}><p>{item.available.toLocaleString('th-TH')}</p>{item.reserved || item.damaged || item.inTransit ? <p className="mt-1 text-[11px] font-normal text-slate-400">มีจริง {item.onHand.toLocaleString('th-TH')}</p> : null}</td>
                    <td className="px-2 py-3"><StockStatus item={item} /></td>
                    <td className="px-2 py-3 text-right"><button type="button" onClick={(event) => { event.stopPropagation(); openEditor(item); }} className="inline-grid h-9 w-9 place-items-center text-primary-800 hover:bg-primary-50" aria-label={canConfigure ? `ปรับปรุง ${item.name}` : `ดู ${item.name}`} title={canConfigure ? 'ปรับปรุง' : 'ดู'}><Pencil className="h-4 w-4" /></button></td>
                  </tr>
                ))}
                {!visibleItems.length ? <tr><td colSpan={10} className="px-4 py-20 text-center"><PackageOpen className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-700">ไม่พบสินค้าตามเงื่อนไข</p><button type="button" onClick={() => { setSearch(''); setCategoryId(''); setStockFilter('all'); }} className="mt-2 text-sm font-semibold text-primary-800 hover:underline">ล้างตัวกรอง</button></td></tr> : null}
              </tbody>
            </table>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            <span>แสดง {from.toLocaleString('th-TH')}–{to.toLocaleString('th-TH')} จาก {filteredItems.length.toLocaleString('th-TH')} รายการ</span>
            <div className="flex items-center gap-2">
              <span>ต่อหน้า</span>
              <Select value={String(pageSize)} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-8 w-20 border border-slate-300 bg-white px-2 text-xs">{pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}</Select>
              <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="grid h-8 w-8 place-items-center border border-slate-300 disabled:text-slate-300"><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-16 text-center">{currentPage}/{totalPages}</span>
              <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="grid h-8 w-8 place-items-center border border-slate-300 disabled:text-slate-300"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </footer>
        </section>
      </main>

      {editing && form ? <InventoryEditor item={editing} branch={data.branch} form={form} setForm={setForm} canConfigure={canConfigure} saving={saving} onAvailabilityChange={updateCurrentBranchAvailability} onUnitInventoryChanged={() => { invalidateInventory(data.branch.id); void load(true, true); }} onClose={() => { setEditing(null); setForm(null); }} onSubmit={save} /> : null}
    </CommerceShell>
  );
}

function Summary({ label, value, warning = false, danger = false, onClick }: { label: string; value: string; warning?: boolean; danger?: boolean; onClick?: () => void }) {
  const content = <><dt className="text-[11px] font-medium text-slate-500">{label}</dt><dd className={`mt-1 text-base font-semibold tabular-nums ${danger ? 'text-red-700' : warning ? 'text-amber-700' : 'text-slate-900'}`}>{value}</dd></>;
  return onClick ? <button type="button" onClick={onClick} className="border-b border-slate-200 px-4 py-3 text-left hover:bg-slate-50 sm:border-r xl:border-b-0">{content}</button> : <div className="border-b border-slate-200 px-4 py-3 sm:border-r xl:border-b-0">{content}</div>;
}

function ProductImage({ item }: { item: InventoryItem }) {
  return <div className="relative grid h-12 w-12 place-items-center overflow-hidden border border-slate-200 bg-white">{item.imageUrl ? <Image src={item.imageUrl} alt="" fill sizes="48px" className="object-contain p-1" /> : <Warehouse className="h-5 w-5 text-slate-300" />}</div>;
}

function StockStatus({ item }: { item: InventoryItem }) {
  const tone = item.status === 'normal' ? 'text-primary-800' : item.status === 'inactive' ? 'text-slate-500' : item.status === 'low' ? 'text-amber-700' : 'text-red-700';
  return <div className={tone}><p className="text-xs font-semibold">{statusLabels[item.status]}</p><p className="mt-1 text-[11px] text-slate-400">จุดสั่งซื้อ {item.reorderPoint.toLocaleString('th-TH')} {item.unitName}</p></div>;
}

function InventoryEditor({ item, branch, form, setForm, canConfigure, saving, onAvailabilityChange, onUnitInventoryChanged, onClose, onSubmit }: { item: InventoryItem; branch: InventoryData['branch']; form: EditForm; setForm: (form: EditForm) => void; canConfigure: boolean; saving: boolean; onAvailabilityChange: (isActive: boolean) => void; onUnitInventoryChanged: () => void; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  const quantityChanged = toNumber(form.quantityAfter) !== item.onHand;
  const setValue = (key: keyof EditForm, value: string) => setForm({ ...form, [key]: value });
  return <div className="no-print fixed inset-0 z-50 flex justify-end bg-slate-950/40" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="inventory-editor-title" className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-start gap-4 border-b border-slate-200 px-5 py-4">
        <ProductImage item={item} />
        <div className="min-w-0"><h2 id="inventory-editor-title" className="truncate text-lg font-semibold">กำหนดราคาและสต๊อก</h2><p className="mt-1 truncate text-sm text-slate-600">{item.name}</p><p className="mt-1 font-mono text-xs text-slate-400">SKU {item.sku}{item.barcode ? ` · ${item.barcode}` : ''}</p></div>
        <button type="button" onClick={onClose} className="ml-auto grid h-9 w-9 shrink-0 place-items-center text-slate-500 hover:bg-slate-100" aria-label="ปิด"><X className="h-5 w-5" /></button>
      </div>

      <form onSubmit={onSubmit} className="app-scrollbar min-h-0 flex-1 overflow-y-auto">
        {!canConfigure ? <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">บัญชีนี้เปิดดูข้อมูลได้ แต่ไม่มีสิทธิ์ปรับราคาและสต๊อก</div> : null}
        <div className="grid gap-4 border-b border-slate-200 p-5 sm:grid-cols-2">
          <NumberField label={`ราคาขาย / ${item.unitName}`} value={form.salePrice} onChange={(value) => setValue('salePrice', value)} suffix="บาท" disabled={!canConfigure} />
          <NumberField label={`ต้นทุน / ${item.unitName}`} value={form.costPrice} onChange={(value) => setValue('costPrice', value)} suffix="บาท" disabled={!canConfigure} />
          <NumberField label="จุดสั่งซื้อ" value={form.reorderPoint} onChange={(value) => setValue('reorderPoint', value)} suffix={item.unitName} step="0.001" disabled={!canConfigure} />
          <BranchAvailabilityControl item={item} currentBranch={branch} currentBranchIsActive={form.isActive === 'active'} onCurrentBranchChange={onAvailabilityChange} />
        </div>

        <div className="border-b border-slate-200 p-5">
          <h3 className="text-sm font-semibold">ยอดสต๊อกของสาขา</h3>
          <dl className="mt-3 grid grid-cols-2 border border-slate-200 text-sm sm:grid-cols-4"><StockFigure label="คงเหลือ" value={item.onHand} /><StockFigure label="จอง" value={item.reserved} /><StockFigure label="เสียหาย" value={item.damaged} /><StockFigure label="ระหว่างโอน" value={item.inTransit} /></dl>
          {item.unitInventoryMode === 'separate_unit' ? <div className="mt-4"><UnitInventoryPanel productId={item.productId} branchId={branch.id} canConfigure={canConfigure} onChanged={onUnitInventoryChanged} /></div> : <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <NumberField label="จำนวนคงเหลือใหม่" value={form.quantityAfter} onChange={(value) => setValue('quantityAfter', value)} suffix={item.unitName} step="0.001" disabled={!canConfigure} />
            <label className="block text-xs font-semibold text-slate-700">เหตุผลที่ปรับยอด {quantityChanged ? <span className="text-red-600">*</span> : null}<Select value={form.stockReason} disabled={!canConfigure || !quantityChanged} onChange={(event) => setValue('stockReason', event.target.value)} className="mt-1.5 h-11 w-full border border-slate-300 bg-white px-3 text-sm"><option value="">{quantityChanged ? 'เลือกเหตุผล' : 'ยอดไม่เปลี่ยน'}</option><option value="ตรวจนับสินค้า">ตรวจนับสินค้า</option><option value="สินค้าสูญหาย">สินค้าสูญหาย</option><option value="สินค้าเสียหาย">สินค้าเสียหาย</option><option value="สินค้าหมดอายุ">สินค้าหมดอายุ</option><option value="ใช้ภายในร้าน">ใช้ภายในร้าน</option><option value="แก้ไขยอดยกมา">แก้ไขยอดยกมา</option></Select></label>
          </div>
          }
          {quantityChanged ? <div className="mt-3 flex items-start gap-2 bg-amber-50 px-3 py-2 text-xs text-amber-900"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>ระบบจะบันทึกส่วนต่าง {toNumber(form.quantityAfter) - item.onHand > 0 ? '+' : ''}{(toNumber(form.quantityAfter) - item.onHand).toLocaleString('th-TH')} {item.unitName} ลงประวัติการเคลื่อนไหวสต๊อก</span></div> : null}
        </div>

        <label className="block p-5 text-xs font-semibold text-slate-700">หมายเหตุ<textarea value={form.note} disabled={!canConfigure} onChange={(event) => setValue('note', event.target.value)} rows={4} placeholder="รายละเอียดเพิ่มเติมสำหรับการตรวจสอบย้อนหลัง" className="mt-1.5 w-full resize-none border border-slate-300 p-3 text-sm font-normal outline-none focus:border-primary-700 disabled:bg-slate-50" /></label>
      </form>

      <footer className="flex items-center justify-between gap-4 border-t border-slate-200 bg-white px-5 py-4"><p className="text-xs text-slate-500">พร้อมขายปัจจุบัน {item.available.toLocaleString('th-TH')} {item.unitName}</p><div className="flex gap-2"><button type="button" onClick={onClose} className="h-10 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100">ยกเลิก</button><button type="submit" onClick={(event) => { const formElement = event.currentTarget.closest('section')?.querySelector('form'); formElement?.requestSubmit(); }} disabled={!canConfigure || saving} className="h-10 bg-primary-800 px-5 text-sm font-semibold text-white hover:bg-primary-900 disabled:bg-slate-300">{saving ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}</button></div></footer>
    </section>
  </div>;
}

function BranchAvailabilityControl({ item, currentBranch, currentBranchIsActive, onCurrentBranchChange }: { item: InventoryItem; currentBranch: InventoryData['branch']; currentBranchIsActive: boolean; onCurrentBranchChange: (isActive: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AvailabilityData | null>(null);
  const [error, setError] = useState('');
  const [workingBranchId, setWorkingBranchId] = useState<string | null>(null);

  const loadAvailability = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await commerceFetch(`/api/commerce/catalog/availability?product_id=${encodeURIComponent(item.productId)}`) as AvailabilityData;
      setData(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'โหลดข้อมูลสาขาไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [item.productId]);

  const openModal = () => {
    setOpen(true);
    if (!data) void loadAvailability();
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !workingBranchId) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, workingBranchId]);

  const disabledKeys = useMemo(
    () => new Set((data?.overrides || []).filter((entry) => !entry.is_active).map((entry) => entry.branch_id)),
    [data?.overrides],
  );
  const isBranchActive = (branchId: string) => item.productIsActive && !disabledKeys.has(branchId);
  const activeCount = (data?.branches || []).filter((branch) => isBranchActive(branch.id)).length;

  const changeAvailability = async (branch: AvailabilityBranch, isActive: boolean) => {
    try {
      setWorkingBranchId(branch.id);
      setError('');
      await commerceFetch('/api/commerce/catalog/availability', {
        method: 'PUT',
            body: JSON.stringify({ branch_id: branch.id, product_id: item.productId, is_active: isActive }),
      });
      setData((current) => {
        if (!current) return current;
        const remaining = current.overrides.filter((entry) => entry.branch_id !== branch.id);
        return {
          ...current,
          overrides: isActive
            ? remaining
            : [...remaining, { branch_id: branch.id, product_id: item.productId, is_active: false, updated_at: new Date().toISOString() }],
        };
      });
      if (branch.id === currentBranch.id) onCurrentBranchChange(isActive);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'บันทึกสถานะสาขาไม่สำเร็จ');
    } finally {
      setWorkingBranchId(null);
    }
  };

  return <div className="block text-xs font-semibold text-slate-700">
    สาขาที่วางขาย
    <button type="button" onClick={openModal} className="group mt-1.5 flex h-11 w-full items-center gap-2.5 border border-slate-300 bg-white px-3 text-left transition-colors hover:border-primary-500 hover:bg-primary-50/60">
      <span className="grid h-7 w-7 shrink-0 place-items-center bg-primary-50 text-primary-800 transition-colors group-hover:bg-primary-100"><Store className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-4 text-slate-900">จัดการสาขาที่ขาย</span>
        <span className={`mt-0.5 block truncate text-[11px] font-normal leading-3 ${currentBranchIsActive ? 'text-primary-700' : 'text-slate-500'}`}>{currentBranch.name}: {currentBranchIsActive ? 'เปิดขาย' : 'หยุดขาย'}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-700" />
    </button>
    {!item.productIsActive ? <span className="mt-1 block text-[11px] font-normal text-red-600">สินค้านี้ถูกปิดจากข้อมูลกลาง จึงยังเปิดขายรายสาขาไม่ได้</span> : null}

    {open ? <div className="no-print fixed inset-0 z-[80] grid place-items-center bg-slate-950/55 p-4" onMouseDown={() => { if (!workingBranchId) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="branch-availability-title" className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start gap-4 border-b border-slate-200 px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center bg-primary-50 text-primary-800"><Store className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h3 id="branch-availability-title" className="text-lg font-semibold text-slate-950">กำหนดสาขาที่วางขาย</h3>
            <p className="mt-1 truncate text-sm text-slate-600">{item.name}</p>
            <p className="mt-1 font-mono text-xs text-slate-400">SKU {item.sku}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} disabled={Boolean(workingBranchId)} className="grid h-9 w-9 shrink-0 place-items-center text-slate-500 hover:bg-slate-100 disabled:opacity-40" aria-label="ปิด"><X className="h-5 w-5" /></button>
        </header>

        {!item.productIsActive ? <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">สินค้าถูกปิดจากข้อมูลกลาง ทุกสาขาจึงอยู่ในสถานะหยุดขาย</div> : null}
        {error ? <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800"><span>{error}</span><button type="button" onClick={() => void loadAvailability()} className="shrink-0 font-semibold underline">ลองอีกครั้ง</button></div> : null}

        <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? <div className="grid min-h-48 place-items-center text-sm text-slate-500"><div className="text-center"><LoaderCircle className="mx-auto h-6 w-6 animate-spin text-primary-700" /><p className="mt-3">กำลังโหลดข้อมูลสาขา…</p></div></div> : null}
          {!loading && data ? <div className="space-y-2">
            {data.branches.map((branch) => {
              const isCurrent = branch.id === currentBranch.id;
              const isActive = isBranchActive(branch.id);
              const isWorking = workingBranchId === branch.id;
              return <div key={branch.id} className={`flex items-center gap-3 border px-4 py-3 transition-colors ${isActive ? (isCurrent ? 'border-emerald-400 bg-emerald-50' : 'border-emerald-200 bg-emerald-50/60') : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <span className={`grid h-9 w-9 shrink-0 place-items-center ${isActive ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-500'}`}><Store className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-slate-900">{branch.name}</p>{isCurrent ? <span className="bg-primary-100 px-2 py-0.5 text-[10px] font-semibold text-primary-900">สาขาปัจจุบัน</span> : null}</div>
                  <p className={`mt-0.5 text-xs font-medium ${isActive ? 'text-emerald-700' : 'text-slate-500'}`}>{branch.code ? `รหัส ${branch.code} · ` : ''}{isActive ? 'เปิดขายสินค้านี้' : 'ไม่ได้วางขายสินค้านี้'}</p>
                </div>
                <button type="button" role="switch" aria-checked={isActive} aria-label={`${isActive ? 'หยุดขาย' : 'เปิดขาย'} ${item.name} ที่ ${branch.name}`} disabled={!item.productIsActive || Boolean(workingBranchId)} onClick={() => void changeAvailability(branch, !isActive)} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${isActive ? 'bg-emerald-700' : 'bg-slate-300'} disabled:cursor-not-allowed disabled:opacity-45`}>
                  <span className={`absolute top-1 grid h-5 w-5 place-items-center rounded-full bg-white shadow-sm transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`}>{isWorking ? <LoaderCircle className="h-3 w-3 animate-spin text-emerald-700" /> : isActive ? <Check className="h-3 w-3 text-emerald-700" /> : <X className="h-3 w-3 text-slate-400" />}</span>
                </button>
              </div>;
            })}
          </div> : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-xs font-normal text-slate-500">{data ? `เปิดขาย ${activeCount} จาก ${data.branches.length} สาขา · บันทึกทันทีเมื่อกดสวิตช์` : 'เลือกเปิดหรือหยุดขายแยกตามสาขา'}</p>
          <button type="button" onClick={() => setOpen(false)} disabled={Boolean(workingBranchId)} className="h-10 bg-primary-800 px-5 text-sm font-semibold text-white hover:bg-primary-900 disabled:bg-slate-300">เสร็จสิ้น</button>
        </footer>
      </section>
    </div> : null}
  </div>;
}

function NumberField({ label, value, onChange, suffix, step = '0.01', disabled = false }: { label: string; value: string; onChange: (value: string) => void; suffix: string; step?: string; disabled?: boolean }) {
  return <label className="block text-xs font-semibold text-slate-700">{label}<span className="mt-1.5 flex h-11 border border-slate-300 bg-white focus-within:border-primary-700"><input required type="number" min="0" step={step} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 px-3 text-right text-sm tabular-nums outline-none disabled:bg-slate-50" /><span className="grid place-items-center border-l border-slate-200 bg-slate-50 px-3 text-xs font-normal text-slate-500">{suffix}</span></span></label>;
}

function StockFigure({ label, value }: { label: string; value: number }) {
  return <div className="border-b border-r border-slate-200 px-3 py-2 last:border-r-0 sm:border-b-0"><dt className="text-[11px] text-slate-500">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value.toLocaleString('th-TH')}</dd></div>;
}
