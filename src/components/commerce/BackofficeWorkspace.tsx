'use client';
/* eslint-disable @next/next/no-img-element */

import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Barcode,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shapes,
  SlidersHorizontal,
} from 'lucide-react';
import { CommerceInitialState } from '@/components/commerce/CommerceInitialState';
import { CommerceShell } from '@/components/commerce/CommerceShell';
import type {
  CatalogCategory,
  CatalogProduct,
} from '@/components/commerce/ProductCatalogEditor';
import Select from '@/components/ui/Select';
import { getAccessToken } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

const ProductCatalogEditor = dynamic(
  () => import('@/components/commerce/ProductCatalogEditor').then((module) => module.ProductCatalogEditor),
  { ssr: false },
);

type CatalogResponse = {
  products: CatalogProduct[];
  categories: CatalogCategory[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: { total: number; active: number; missingImage: number };
};

type SortMode = 'updated' | 'name' | 'sku' | 'price_high' | 'price_low';
const SEARCH_DEBOUNCE_MS = 90;

const DEFAULT_CATALOG_PATH = '/api/commerce/catalog/products?page=1&page_size=25&status=all&sort=updated';
const CATALOG_CLIENT_CACHE_TTL = 60_000;
const CATALOG_CLIENT_CACHE_LIMIT = 40;
const catalogResponseCache = new Map<string, { value: CatalogResponse; savedAt: number }>();
const catalogRequests = new Map<string, Promise<CatalogResponse>>();

function readCatalogCache(path: string) {
  return catalogResponseCache.get(path) || null;
}

function rememberCatalogResponse(path: string, value: CatalogResponse) {
  catalogResponseCache.delete(path);
  catalogResponseCache.set(path, { value, savedAt: Date.now() });
  while (catalogResponseCache.size > CATALOG_CLIENT_CACHE_LIMIT) {
    const oldestKey = catalogResponseCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    catalogResponseCache.delete(oldestKey);
  }
}

function invalidateCatalogCache() {
  catalogResponseCache.clear();
}

async function catalogFetch(path: string) {
  const pending = catalogRequests.get(path);
  if (pending) return pending;

  const request = (async () => {
    const accessToken = await getAccessToken();
    const response = await fetch(path, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'โหลดข้อมูลสินค้าไม่สำเร็จ');
    const value = body as CatalogResponse;
    rememberCatalogResponse(path, value);
    return value;
  })().finally(() => {
    catalogRequests.delete(path);
  });

  catalogRequests.set(path, request);
  return request;
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatBaht(value: number | string | null | undefined) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(numberValue(value));
}

function formatDate(value: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('th-TH', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  }).format(new Date(value));
}

export default function BackofficeWorkspace() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const initialResponse = readCatalogCache(DEFAULT_CATALOG_PATH)?.value;
  const [products, setProducts] = useState<CatalogProduct[]>(initialResponse?.products || []);
  const [categories, setCategories] = useState<CatalogCategory[]>(initialResponse?.categories || []);
  const [pagination, setPagination] = useState<CatalogResponse['pagination']>(initialResponse?.pagination || { page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [summary, setSummary] = useState<CatalogResponse['summary']>(initialResponse?.summary || { total: 0, active: 0, missingImage: 0 });
  const [loading, setLoading] = useState(!initialResponse);
  const [hasLoadedCatalog, setHasLoadedCatalog] = useState(Boolean(initialResponse));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('updated');
  const [pageSize, setPageSize] = useState('25');
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [searchPreview, setSearchPreview] = useState<CatalogProduct[] | null>(null);
  const activeRequestId = useRef(0);
  const searchTimer = useRef<number | null>(null);

  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const load = useCallback(async (quiet = false, force = false) => {
    const requestId = ++activeRequestId.current;
    const parameters = new URLSearchParams({
        page: String(page),
        page_size: pageSize,
        status: statusFilter,
        sort: sortMode,
      });
    if (debouncedQuery) parameters.set('q', debouncedQuery);
    if (categoryFilter !== 'all') parameters.set('category_id', categoryFilter);
    const path = `/api/commerce/catalog/products?${parameters}`;
    const cached = readCatalogCache(path);

    if (cached) {
      setProducts(cached.value.products || []);
      setCategories(cached.value.categories || []);
      setPagination(cached.value.pagination);
      setSummary(cached.value.summary);
      setHasLoadedCatalog(true);
      setLoading(false);
      if (!force && Date.now() - cached.savedAt < CATALOG_CLIENT_CACHE_TTL) {
        setSearchPreview(null);
        setRefreshing(false);
        return;
      }
    } else if (!quiet) {
      setLoading(true);
      setRefreshing(Boolean(debouncedQuery));
    }

    try {
      setRefreshing(Boolean(cached) || quiet);
      setError('');
      const response = await catalogFetch(path);
      if (requestId !== activeRequestId.current) return;
      setProducts(response.products || []);
      setCategories(response.categories || []);
      setPagination(response.pagination);
      setSummary(response.summary);
      setHasLoadedCatalog(true);
      setSearchPreview(null);
    } catch (loadError) {
      if (requestId !== activeRequestId.current) return;
      setError(loadError instanceof Error ? loadError.message : 'โหลดข้อมูลสินค้าไม่สำเร็จ');
    } finally {
      if (requestId === activeRequestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [categoryFilter, debouncedQuery, page, pageSize, sortMode, statusFilter]);

  useEffect(() => { void load(); }, [load]);
  const handleSearchChange = (value: string) => {
    activeRequestId.current += 1;
    setQuery(value);
    const normalized = value.trim().toLocaleLowerCase('th');
    if (normalized) {
      const matches = products.filter((product) => [product.name, product.sku, product.barcode, product.brand]
        .some((field) => field?.toLocaleLowerCase('th').includes(normalized)));
      setSearchPreview(matches.length ? matches : null);
    } else {
      setSearchPreview(null);
    }
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      startTransition(() => {
        setDebouncedQuery(value.trim());
        setPage(1);
      });
    }, SEARCH_DEBOUNCE_MS);
  };
  useEffect(() => { setPage(1); }, [categoryFilter, statusFilter, sortMode, pageSize]);
  useEffect(() => () => {
    activeRequestId.current += 1;
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
  }, []);

  const visibleProducts = searchPreview || products;

  const openCreate = () => {
    setSelectedProductId(null);
    setEditorOpen(true);
  };

  const openEdit = (productId: string) => {
    setSelectedProductId(productId);
    setEditorOpen(true);
  };

  const handleSaved = async (savedMessage: string) => {
    setEditorOpen(false);
    setMessage(savedMessage);
    invalidateCatalogCache();
    await load(true, true);
    window.setTimeout(() => setMessage(''), 3600);
  };

  if (loading && !hasLoadedCatalog) {
    return <CommerceShell section="backoffice"><CatalogLoadingSkeleton /></CommerceShell>;
  }

  if (error && !hasLoadedCatalog) {
    return <CommerceShell section="backoffice"><main className="relative mx-auto max-w-[1680px] px-3 py-5 sm:px-5"><CommerceInitialState status={error} onRetry={() => void load()} label="ไม่สามารถโหลดสินค้าได้" /></main></CommerceShell>;
  }

  return <CommerceShell section="backoffice">
    <main className="relative mx-auto max-w-[1680px] px-3 py-5 sm:px-5">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-medium text-primary-800">ข้อมูลกลาง / แคตตาล็อกสินค้า</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">สินค้าและบริการ</h1>
          <p className="mt-1 text-sm text-slate-500">ข้อมูลสินค้า หน่วย ราคา รูปภาพ และเงื่อนไขการขายที่ใช้ร่วมกันทุกสาขา</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {message ? <span role="status" className="mr-2 text-sm font-medium text-primary-800">{message}</span> : null}
          <button type="button" onClick={() => void load(true, true)} disabled={refreshing} className="inline-flex h-10 items-center justify-center gap-2 border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 active:translate-y-px disabled:opacity-50">
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />อัปเดต
          </button>
          {canManage ? <button type="button" onClick={openCreate} className="inline-flex h-10 items-center justify-center gap-2 bg-primary-800 px-4 text-sm font-semibold text-white transition hover:bg-primary-900 active:translate-y-px">
            <Plus className="size-4" />เพิ่มสินค้า
          </button> : null}
        </div>
      </header>

      <section aria-label="สรุปข้อมูลสินค้า" className="mt-5 grid border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4">
        <SummaryItem icon={Package} label="สินค้าทั้งหมด" value={`${summary.total.toLocaleString('th-TH')} รายการ`} />
        <SummaryItem icon={Boxes} label="เปิดขาย" value={`${summary.active.toLocaleString('th-TH')} รายการ`} />
        <SummaryItem icon={Shapes} label="หมวดสินค้า" value={`${categories.filter((category) => category.is_active !== false).length.toLocaleString('th-TH')} หมวด`} />
        <SummaryItem icon={ImageOff} label="ยังไม่มีรูป" value={`${summary.missingImage.toLocaleString('th-TH')} รายการ`} alert={summary.missingImage > 0} />
      </section>

      <section aria-busy={loading || refreshing} className="relative mt-4 border border-slate-200 bg-white">
        {loading || refreshing ? <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-primary-100"><span className="catalog-progress block h-full w-1/3 bg-primary-700" /></div> : null}
        <div className="grid gap-3 border-b border-slate-200 p-3 lg:grid-cols-[minmax(18rem,1fr)_15rem_13rem_13rem_auto]">
          <label className="relative block">
            <span className="sr-only">ค้นหาสินค้า</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => handleSearchChange(event.target.value)} placeholder="ค้นหาชื่อสินค้า SKU บาร์โค้ด หรือยี่ห้อ" className="h-10 w-full border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-primary-700 focus:ring-2 focus:ring-primary-100" />
          </label>
          <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-10 w-full border border-slate-300 bg-white px-3 text-sm" aria-label="กรองตามหมวดสินค้า">
            <option value="all">ทุกหมวดสินค้า</option>
            {categories.filter((category) => category.is_active !== false).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 w-full border border-slate-300 bg-white px-3 text-sm" aria-label="กรองตามสถานะ">
            <option value="all">ทุกสถานะ</option>
            <option value="active">เปิดขาย</option>
            <option value="inactive">ปิดขาย</option>
            <option value="missing_image">ยังไม่มีรูป</option>
          </Select>
          <Select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="h-10 w-full border border-slate-300 bg-white px-3 text-sm" aria-label="เรียงสินค้า">
            <option value="updated">อัปเดตล่าสุด</option>
            <option value="name">เรียงตามชื่อ</option>
            <option value="sku">เรียงตาม SKU</option>
            <option value="price_high">ราคาสูงสุด</option>
            <option value="price_low">ราคาต่ำสุด</option>
          </Select>
          <div className="flex h-10 items-center justify-end gap-2 text-xs text-slate-500"><SlidersHorizontal className="h-4 w-4" />{(searchPreview ? visibleProducts.length : pagination.total).toLocaleString('th-TH')} รายการ</div>
        </div>

        <div className="overflow-hidden">
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-16" />
              <col />
              <col className="w-32" />
              <col className="w-32" />
              <col className="w-24" />
              <col className="w-24" />
              <col className="w-20" />
            </colgroup>
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="px-2 py-3">รูป</th>
                <th className="px-2 py-3">สินค้า</th>
                <th className="hidden px-2 py-3 xl:table-cell">SKU / บาร์โค้ด</th>
                <th className="hidden px-2 py-3 lg:table-cell">หมวด</th>
                <th className="hidden px-2 py-3 md:table-cell">หน่วยหลัก</th>
                <th className="px-2 py-3 text-right">ราคากลาง</th>
                <th className="px-2 py-3 text-right">คำสั่ง</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((product) => <tr key={product.id} role={canManage ? 'button' : undefined} tabIndex={canManage ? 0 : undefined} aria-label={canManage ? `เปิดสินค้า ${product.name}` : undefined} onClick={canManage ? () => openEdit(product.id) : undefined} onKeyDown={canManage ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEdit(product.id); } } : undefined} className={`border-b border-slate-100 align-middle transition-colors last:border-b-0 ${canManage ? 'cursor-pointer hover:bg-slate-100 active:bg-slate-200 focus-visible:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-300' : ''}`}>
                <td className="px-2 py-2">
                  <div className="grid h-12 w-12 place-items-center overflow-hidden border border-slate-200 bg-white">
                    {product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-contain p-1" /> : <Package className="size-5 text-slate-300" />}
                  </div>
                </td>
                <td className="min-w-0 px-2 py-3">
                  <p className="break-words font-medium leading-5 text-slate-900" title={product.name}>{product.name}</p>
                  <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-500 xl:hidden">
                    <Barcode className="size-3.5 shrink-0" /><span className="truncate">{product.sku}{product.barcode ? ` · ${product.barcode}` : ''}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-400">{product.brand || 'ไม่ระบุยี่ห้อ'} · แก้ไข {formatDate(product.updated_at)}</p>
                </td>
                <td className="hidden px-2 py-3 xl:table-cell">
                  <p className="truncate font-medium text-slate-700">{product.sku}</p>
                  <p className="mt-1 truncate text-xs text-slate-400">{product.barcode || 'ไม่มีบาร์โค้ด'}</p>
                </td>
                <td className="hidden break-words px-2 py-3 text-slate-600 lg:table-cell"><span className="line-clamp-2">{product.category_name || 'ไม่ระบุหมวด'}</span></td>
                <td className="hidden px-2 py-3 text-slate-600 md:table-cell">{product.default_unit?.name || product.base_unit_code}</td>
                <td className="px-2 py-3 text-right">
                  <p className="font-medium tabular-nums text-slate-900">{formatBaht(product.default_sale_price)}</p>
                  <p className={`mt-1 text-xs ${product.is_active ? 'text-primary-700' : 'text-slate-400'}`}>{product.is_active ? 'เปิดขาย' : 'ปิดขาย'}</p>
                </td>
                <td className="px-2 py-3 text-right">
                  {canManage ? <button type="button" onClick={(event) => { event.stopPropagation(); openEdit(product.id); }} onKeyDown={(event) => event.stopPropagation()} className="inline-grid h-9 w-9 place-items-center text-primary-800 transition hover:bg-primary-50" aria-label={`แก้ไข ${product.name}`} title="แก้ไข"><Pencil className="size-4" /></button> : <span className="text-xs text-slate-400">ดูเท่านั้น</span>}
                </td>
              </tr>)}
              {!visibleProducts.length ? <tr><td colSpan={7} className="px-5 py-20 text-center"><Package className="mx-auto size-8 text-slate-300" /><p className="mt-3 font-medium text-slate-700">ไม่พบสินค้า</p><p className="mt-1 text-sm text-slate-500">ปรับคำค้นหาหรือตัวกรองแล้วลองอีกครั้ง</p></td></tr> : null}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          <p className="text-xs text-slate-500">{searchPreview ? 'กำลังค้นหา…' : `แสดง ${products.length ? (pagination.page - 1) * pagination.pageSize + 1 : 0}–${Math.min(pagination.page * pagination.pageSize, pagination.total)} จาก ${pagination.total.toLocaleString('th-TH')} รายการ`}</p>
          <div className="flex items-center justify-end gap-2">
            <span>ต่อหน้า</span>
            <Select value={pageSize} onChange={(event) => setPageSize(event.target.value)} className="h-8 w-20 border border-slate-300 bg-white px-2 text-xs" aria-label="จำนวนรายการต่อหน้า">
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </Select>
            <button type="button" aria-label="หน้าก่อนหน้า" disabled={pagination.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="grid h-8 w-8 place-items-center border border-slate-300 disabled:text-slate-300"><ChevronLeft className="size-4" /></button>
            <span className="min-w-16 text-center">{pagination.page}/{pagination.totalPages}</span>
            <button type="button" aria-label="หน้าถัดไป" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} className="grid h-8 w-8 place-items-center border border-slate-300 disabled:text-slate-300"><ChevronRight className="size-4" /></button>
          </div>
        </footer>
      </section>

      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    </main>

    {editorOpen ? <ProductCatalogEditor
        productId={selectedProductId}
        categories={categories}
        onClose={() => setEditorOpen(false)}
        onSaved={(savedMessage) => void handleSaved(savedMessage)}
        onCategoryCreated={(category) => setCategories((current) => [...current.filter((item) => item.id !== category.id), category].sort((a, b) => a.name.localeCompare(b.name, 'th')))}
      /> : null}
  </CommerceShell>;
}

function SummaryItem({ icon: Icon, label, value, alert = false }: { icon: typeof Package; label: string; value: string; alert?: boolean }) {
  return <div className="flex min-h-24 items-center gap-4 border-b border-slate-200 px-5 lg:border-b-0 lg:border-r lg:last:border-r-0">
    <Icon className={`size-5 shrink-0 ${alert ? 'text-amber-700' : 'text-primary-800'}`} />
    <div><p className="text-xs font-medium text-slate-500">{label}</p><p className={`mt-1 text-xl font-semibold tabular-nums ${alert ? 'text-amber-800' : 'text-slate-950'}`}>{value}</p></div>
  </div>;
}

function CatalogLoadingSkeleton() {
  return <main className="relative mx-auto max-w-[1680px] px-3 py-5 sm:px-5" aria-label="กำลังโหลดสินค้า">
    <div className="h-4 w-56 animate-pulse bg-slate-200" />
    <div className="mt-3 h-10 w-80 animate-pulse bg-slate-200" />
    <div className="mt-2 h-5 w-96 max-w-full animate-pulse bg-slate-100" />
    <section className="mt-5 border border-slate-200 bg-white">
      <div className="grid gap-3 border-b border-slate-200 p-3 lg:grid-cols-[minmax(18rem,1fr)_15rem_13rem_13rem_auto]"><div className="h-10 animate-pulse bg-slate-100" /><div className="h-10 animate-pulse bg-slate-100" /><div className="h-10 animate-pulse bg-slate-100" /><div className="h-10 animate-pulse bg-slate-100" /><div className="h-10 w-20 justify-self-end animate-pulse bg-slate-100" /></div>
      <div className="divide-y divide-slate-100">{Array.from({ length: 6 }, (_, index) => <div key={index} className="grid grid-cols-[4rem_minmax(0,1fr)_5rem] items-center gap-2 px-2 py-3"><div className="h-12 w-12 animate-pulse bg-slate-100" /><div className="space-y-2"><div className="h-4 w-2/3 animate-pulse bg-slate-100" /><div className="h-3 w-1/3 animate-pulse bg-slate-100" /></div><div className="h-9 w-9 animate-pulse bg-slate-100" /></div>)}</div>
    </section>
  </main>;
}
