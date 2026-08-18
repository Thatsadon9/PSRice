'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Download,
  FileSpreadsheet,
  PackageSearch,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  X,
} from 'lucide-react';
import Select from '@/components/ui/Select';
import { CommerceShell } from '@/components/commerce/CommerceShell';
import {
  CommerceBootstrap,
  CommerceReportMetric,
  CommerceReportResponse,
  formatBaht,
  toNumber,
} from '@/lib/commerce';
import { getAccessToken } from '@/lib/supabase';

type DrawerState = { title: string; kind: 'topProducts' | 'lowStock' | 'payments' | 'categories' | 'branches' | 'sales' | 'trend'; report?: CommerceReportResponse; loading?: boolean } | null;

const metricLabels: Record<CommerceReportMetric, string> = {
  sales: 'ยอดขาย',
  profit: 'กำไร',
  transactions: 'จำนวนบิล',
  expenses: 'ค่าใช้จ่าย',
};

function bangkokToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function offsetDate(value: string, offset: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function rangeForPreset(preset: number) {
  const to = bangkokToday();
  return { from: offsetDate(to, -(preset - 1)), to };
}

async function requestJson<T>(path: string) {
  const token = await getAccessToken();
  const response = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'ทำรายการไม่สำเร็จ');
  return body as T;
}

function number(value: number | null | undefined) {
  return toNumber(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function ChangeBadge({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  if (value === null) return null;
  const positive = inverse ? value < 0 : value > 0;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${positive ? 'text-emerald-700' : 'text-rose-700'}`}><Icon aria-hidden="true" className="h-3 w-3" />{Math.abs(value).toFixed(1)}%</span>;
}

function Kpi({ label, value, note, change, icon, tone = 'default' }: { label: string; value: string; note?: string; change?: number | null; icon: React.ReactNode; tone?: 'default' | 'green' | 'amber' }) {
  return <div className="border border-slate-200 bg-white p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-slate-500">{label}</p><p className={`mt-2 text-xl font-semibold tracking-tight ${tone === 'green' ? 'text-primary-800' : tone === 'amber' ? 'text-amber-800' : 'text-slate-900'}`}>{value}</p></div><span className="grid h-9 w-9 shrink-0 place-items-center border border-slate-200 bg-slate-50 text-primary-800">{icon}</span></div>
    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><ChangeBadge value={change ?? null} />{note ? <span>{note}</span> : null}</div>
  </div>;
}

function Panel({ title, eyebrow, children, onMore, className = '' }: { title: string; eyebrow?: string; children: React.ReactNode; onMore?: () => void; className?: string }) {
  return <section className={`border border-slate-200 bg-white ${className}`}><div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-primary-800">{eyebrow || 'สรุปข้อมูล'}</p><h2 className="mt-0.5 text-base font-semibold text-slate-900">{title}</h2></div>{onMore ? <button type="button" onClick={onMore} className="text-xs font-medium text-slate-500 underline-offset-4 hover:text-primary-800 hover:underline">ดูทั้งหมด</button> : null}</div>{children}</section>;
}

function Empty({ children = 'ไม่มีข้อมูลในช่วงที่เลือก' }: { children?: React.ReactNode }) {
  return <div className="grid min-h-32 place-items-center px-4 py-8 text-center text-sm text-slate-500">{children}</div>;
}

function LoadingState() {
  return <div className="space-y-5" aria-label="กำลังโหลดรายงาน"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-28 animate-pulse border border-slate-200 bg-white" />)}</div><div className="h-[26rem] animate-pulse border border-slate-200 bg-white" /><div className="grid gap-5 lg:grid-cols-2"><div className="h-72 animate-pulse border border-slate-200 bg-white" /><div className="h-72 animate-pulse border border-slate-200 bg-white" /></div></div>;
}

function ReportTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number; dataKey?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const isBills = item.dataKey === 'transactions';
  return <div className="border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"><p className="font-medium text-slate-700">{label}</p><p className="mt-1 text-primary-800">{metricLabels[item.dataKey as CommerceReportMetric] || item.dataKey}: {isBills ? `${formatNumber(number(item.value))} บิล` : formatBaht(number(item.value))}</p></div>;
}

function ImageThumb({ src, alt }: { src: string | null; alt: string }) {
  return src ? <img src={src} alt={alt} className="h-9 w-9 shrink-0 border border-slate-200 object-cover" /> : <span className="grid h-9 w-9 shrink-0 place-items-center border border-slate-200 bg-slate-50 text-slate-300"><PackageSearch aria-hidden="true" className="h-4 w-4" /></span>;
}

export default function ReportsWorkspace() {
  const initialRange = rangeForPreset(30);
  const [bootstrap, setBootstrap] = useState<CommerceBootstrap | null>(null);
  const [report, setReport] = useState<CommerceReportResponse | null>(null);
  const [branchId, setBranchId] = useState('');
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [preset, setPreset] = useState(30);
  const [compare, setCompare] = useState(true);
  const [metric, setMetric] = useState<CommerceReportMetric>('sales');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drawer, setDrawer] = useState<DrawerState>(null);

  const buildPath = useCallback((nextBranchId: string, nextFrom: string, nextTo: string) => `/api/commerce/reports?branch_id=${encodeURIComponent(nextBranchId)}&from=${encodeURIComponent(nextFrom)}&to=${encodeURIComponent(nextTo)}`, []);
  const loadReport = useCallback(async (nextBranchId: string, nextFrom: string, nextTo: string, showLoading = true) => {
    if (!nextBranchId) return null;
    if (showLoading) setLoading(true);
    setError('');
    try {
      const next = await requestJson<CommerceReportResponse>(buildPath(nextBranchId, nextFrom, nextTo));
      if (showLoading) setReport(next);
      return next;
    } catch (loadError) {
      if (showLoading) setError(loadError instanceof Error ? loadError.message : 'โหลดรายงานไม่สำเร็จ');
      return null;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [buildPath]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextBootstrap = await requestJson<CommerceBootstrap>('/api/commerce/bootstrap');
        if (cancelled) return;
        setBootstrap(nextBootstrap);
        setBranchId(nextBootstrap.branchId);
        await loadReport(nextBootstrap.branchId, initialRange.from, initialRange.to);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'โหลดข้อมูลรายงานไม่สำเร็จ');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [initialRange.from, initialRange.to, loadReport]);

  const branchOptions = useMemo(() => [
    { value: 'all', label: 'ทุกสาขาที่มีสิทธิ์', description: 'รวมข้อมูลจากสาขาที่เข้าถึงได้' },
    ...(bootstrap?.branches || []).map((branch) => ({ value: branch.id, label: branch.name })),
  ], [bootstrap?.branches]);

  const applyRange = (nextFrom: string, nextTo: string, nextPreset = 0, nextBranchId = branchId) => {
    setFrom(nextFrom); setTo(nextTo); setPreset(nextPreset); setBranchId(nextBranchId); void loadReport(nextBranchId, nextFrom, nextTo);
  };

  const openPanel = (kind: NonNullable<DrawerState>['kind'], title: string) => setDrawer({ kind, title, report: report || undefined });
  const openTrend = async (period: string) => {
    const end = report?.filters.granularity === 'month' ? offsetDate(period, 30) : report?.filters.granularity === 'week' ? offsetDate(period, 6) : period;
    setDrawer({ kind: 'trend', title: `รายละเอียดช่วง ${formatDate(period)}`, loading: true });
    const detail = await loadReport(branchId, period, end, false);
    setDrawer({ kind: 'trend', title: `รายละเอียดช่วง ${formatDate(period)}`, report: detail || report || undefined });
  };

  const exportReport = async () => {
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/commerce/export?type=report&branch_id=${encodeURIComponent(branchId)}&from=${from}&to=${to}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error('ส่งออก Excel ไม่สำเร็จ');
      const blob = await response.blob();
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `ps-rice-report-${from}-${to}.xlsx`; link.click(); URL.revokeObjectURL(link.href);
    } catch (exportError) { setError(exportError instanceof Error ? exportError.message : 'ส่งออกไม่สำเร็จ'); }
  };

  const exportCsv = () => {
    if (!report) return;
    const rows = report.topProducts.map((row) => [row.productName, row.unitName, row.categoryName || '-', row.quantity, row.sales, row.cost ?? 'ต้นทุนยังไม่ครบ', row.profit ?? 'ต้นทุนยังไม่ครบ']);
    const csv = [['สินค้า', 'หน่วย', 'หมวดหมู่', 'จำนวนขาย', 'ยอดขาย', 'ต้นทุน', 'กำไร'], ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })); link.download = `ps-rice-products-${from}-${to}.csv`; link.click(); URL.revokeObjectURL(link.href);
  };

  const trendValue = metric === 'profit' && report?.trend.some((point) => point.profit === null) ? 'profit' : metric;
  const trendLabel = report ? `${formatDate(report.filters.from)} – ${formatDate(report.filters.to)} · แบ่งข้อมูลเป็น${report.filters.granularity === 'day' ? 'รายวัน' : report.filters.granularity === 'week' ? 'รายสัปดาห์' : 'รายเดือน'}` : '';

  return <CommerceShell section="backoffice"><main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
    <header className="border-b border-slate-200 pb-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-medium text-primary-800">Commerce / Reports</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">รายงานร้านค้า</h1><p className="mt-1 text-sm text-slate-500">ภาพรวมยอดขาย กำไร สต๊อก และรายการที่ต้องตัดสินใจ</p></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => void loadReport(branchId, from, to)} className="inline-flex h-9 items-center gap-2 border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />รีเฟรช</button><button type="button" onClick={() => void exportReport()} className="inline-flex h-9 items-center gap-2 border border-primary-800 bg-primary-800 px-3 text-xs font-medium text-white hover:bg-primary-900"><FileSpreadsheet aria-hidden="true" className="h-3.5 w-3.5" />ส่งออก Excel</button><button type="button" onClick={exportCsv} className="inline-flex h-9 items-center gap-2 border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"><Download aria-hidden="true" className="h-3.5 w-3.5" />CSV สินค้าขายดี</button></div></div>
      <div className="mt-5 flex flex-wrap items-end gap-3"><div className="min-w-56 flex-1 sm:flex-none"><label className="mb-1.5 block text-xs font-medium text-slate-600">ขอบเขตสาขา</label><Select shape="square" searchable options={branchOptions} value={branchId} onValueChange={(value) => applyRange(from, to, preset, value)} className="w-full sm:w-64" /></div><div><span className="mb-1.5 block text-xs font-medium text-slate-600">ช่วงเวลา</span><div className="flex h-10 border border-slate-300 bg-white">{[1, 7, 30, 90].map((value) => <button key={value} type="button" onClick={() => { const next = rangeForPreset(value); applyRange(next.from, next.to, value); }} className={`border-r border-slate-200 px-3 text-xs font-medium last:border-r-0 hover:bg-slate-50 ${preset === value ? 'bg-primary-50 text-primary-900' : 'text-slate-600'}`}>{value === 1 ? 'วันนี้' : `${value} วัน`}</button>)}</div></div><div><label className="mb-1.5 block text-xs font-medium text-slate-600">กำหนดเอง</label><div className="flex h-10 items-center gap-1 border border-slate-300 bg-white px-2"><input aria-label="วันเริ่มต้น" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPreset(0); }} className="w-32 border-0 bg-transparent text-xs outline-none" /><span className="text-slate-400">–</span><input aria-label="วันสิ้นสุด" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPreset(0); }} className="w-32 border-0 bg-transparent text-xs outline-none" /><button type="button" onClick={() => void loadReport(branchId, from, to)} className="border-l border-slate-200 pl-2 text-xs font-medium text-primary-800 hover:underline">ใช้ช่วงนี้</button></div></div><label className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-3 text-xs text-slate-600"><input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} className="accent-[#086f57]" />เทียบช่วงก่อนหน้า</label></div>
    </header>
    {error ? <div role="alert" className="mt-5 flex items-center justify-between gap-3 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><span>{error}</span><button type="button" onClick={() => void loadReport(branchId, from, to)} className="font-medium underline">ลองใหม่</button></div> : null}
    {loading && !report ? <div className="mt-5"><LoadingState /></div> : report ? <div className="mt-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{trendLabel}</span><span>อัปเดตล่าสุด {formatDate(report.meta.updatedAt)} · ต้นทุนที่ตรวจสอบได้ {(report.meta.costCoverage * 100).toFixed(0)}%</span></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Kpi label="ยอดขายสุทธิ" value={formatBaht(report.kpis.netSales)} note="รวม POS และออนไลน์" change={compare ? report.comparison.netSales.changePercent : null} icon={<TrendingUp aria-hidden="true" className="h-4 w-4" />} tone="green" /><Kpi label="กำไรขั้นต้น" value={report.kpis.grossProfit === null ? 'ยังไม่มีต้นทุน' : formatBaht(report.kpis.grossProfit)} note={report.kpis.grossProfitCoverage < 1 ? `ต้นทุนครบ ${(report.kpis.grossProfitCoverage * 100).toFixed(0)}%` : 'จากต้นทุนจริง'} change={compare ? report.comparison.grossProfit.changePercent : null} icon={<BarChart3 aria-hidden="true" className="h-4 w-4" />} tone="green" /><Kpi label="จำนวนบิล" value={formatNumber(report.kpis.bills)} note="รายการขายที่เสร็จสมบูรณ์" change={compare ? report.comparison.bills.changePercent : null} icon={<ShoppingCart aria-hidden="true" className="h-4 w-4" />} /><Kpi label="ยอดเฉลี่ยต่อบิล" value={formatBaht(report.kpis.averageBill)} note="ยอดขายสุทธิ ÷ จำนวนบิล" change={compare ? report.comparison.averageBill.changePercent : null} icon={<FileSpreadsheet aria-hidden="true" className="h-4 w-4" />} /><Kpi label="ต้องติดตามสต๊อก" value={formatNumber(report.kpis.stockRiskCount)} note="รวมหน่วยที่หมดหรือใกล้หมด" icon={<PackageSearch aria-hidden="true" className="h-4 w-4" />} tone="amber" /></div>
      <section className="border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-primary-800">แนวโน้ม</p><h2 className="mt-0.5 text-base font-semibold">ผลลัพธ์ตามช่วงเวลา</h2></div><div role="tablist" aria-label="เลือกตัวชี้วัดกราฟ" className="flex border border-slate-200">{(Object.keys(metricLabels) as CommerceReportMetric[]).map((key) => <button key={key} type="button" role="tab" aria-selected={metric === key} onClick={() => setMetric(key)} className={`border-r border-slate-200 px-3 py-2 text-xs font-medium last:border-r-0 ${metric === key ? 'bg-primary-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{metricLabels[key]}</button>)}</div></div><div className="h-[20rem] px-2 pb-3 pt-5 sm:h-[26rem] sm:px-5"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={report.trend} onClick={(state) => { const chartState = state as unknown as { activePayload?: Array<{ payload?: { period?: string } }> }; const period = chartState.activePayload?.[0]?.payload?.period; if (period) void openTrend(period); }} margin={{ top: 10, right: 10, left: 0, bottom: 8 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={22} /><YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(value) => metric === 'transactions' ? String(value) : `${Math.round(Number(value) / 1000)}k`} /><Tooltip content={<ReportTooltip />} /><Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: 11, paddingBottom: 12 }} formatter={() => metricLabels[metric]} />{metric === 'transactions' ? <Line type="monotone" dataKey="transactions" stroke="#0b765b" strokeWidth={2.5} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} name="transactions" /> : <Line type="monotone" dataKey={trendValue} stroke={metric === 'profit' ? '#15803d' : metric === 'expenses' ? '#b45309' : '#0b765b'} strokeWidth={2.5} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} name={trendValue} connectNulls={false} />}</ComposedChart></ResponsiveContainer></div><p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">คลิกจุดข้อมูลเพื่อดูรายการในช่วงนั้น · {metric === 'profit' && report.meta.costCoverage < 1 ? 'บางรายการยังไม่มีต้นทุน จึงไม่รวมในกำไร' : 'ตัวเลขเป็นยอดจากรายการที่เสร็จสมบูรณ์'}</p></section>
      <div className="grid gap-5 lg:grid-cols-2"><Panel title="สินค้าขายดี" eyebrow="ยอดขายแยกตามสินค้าและหน่วย" onMore={() => openPanel('topProducts', 'สินค้าขายดีทั้งหมด')}><div className="divide-y divide-slate-100">{report.topProducts.slice(0, 5).map((row, index) => <div key={`${row.productId}:${row.productUnitId}`} className="flex items-center gap-3 px-4 py-3"><span className="w-5 text-xs font-semibold text-slate-400">{index + 1}</span><ImageThumb src={row.imageUrl} alt={row.productName} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{row.productName}</p><p className="text-xs text-slate-500">{row.unitName} · {formatNumber(row.quantity)} หน่วย{row.costComplete ? '' : ' · ต้นทุนยังไม่ครบ'}</p></div><div className="text-right"><p className="text-sm font-semibold text-slate-900">{formatBaht(row.sales)}</p>{row.profit !== null ? <p className="text-[11px] text-emerald-700">กำไร {formatBaht(row.profit)}</p> : null}</div></div>)}{!report.topProducts.length ? <Empty /> : null}</div></Panel><Panel title="หน่วยใกล้หมด" eyebrow="สต๊อกที่ต้องติดตาม" onMore={() => openPanel('lowStock', 'รายการสต๊อกที่ต้องติดตาม')}><div className="divide-y divide-slate-100">{report.lowStock.slice(0, 5).map((row) => <div key={`${row.productId}:${row.productUnitId}:${row.branchName || ''}`} className="flex items-center gap-3 px-4 py-3"><ImageThumb src={row.imageUrl} alt={row.productName} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{row.productName} · {row.unitName}</p><p className="text-xs text-slate-500">{row.branchName ? `${row.branchName} · ` : ''}จุดติดตาม {formatNumber(row.reorderPoint)}</p></div><span className={`text-right text-sm font-semibold ${row.status === 'out' ? 'text-rose-700' : 'text-amber-700'}`}>{row.status === 'out' ? 'หมด' : `เหลือ ${formatNumber(row.available)}`}</span></div>)}{!report.lowStock.length ? <Empty>ไม่พบหน่วยที่ต่ำกว่าจุดติดตาม</Empty> : null}</div></Panel></div>
      <div className="grid gap-5 lg:grid-cols-3"><Panel title="วิธีชำระเงิน" eyebrow="สัดส่วนยอดรับชำระ" onMore={() => openPanel('payments', 'วิธีชำระเงินทั้งหมด')}><div className="divide-y divide-slate-100">{report.paymentMix.slice(0, 5).map((row) => { const ratio = report.kpis.netSales ? row.amount / report.kpis.netSales : 0; return <div key={row.method} className="px-4 py-3"><div className="flex justify-between gap-3 text-sm"><span>{row.label}</span><strong>{formatBaht(row.amount)}</strong></div><div className="mt-2 h-1.5 bg-slate-100"><div className="h-full bg-primary-700" style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div><p className="mt-1 text-[11px] text-slate-500">{row.count} รายการ · {(ratio * 100).toFixed(1)}%</p></div>; })}{!report.paymentMix.length ? <Empty /> : null}</div></Panel><Panel title="หมวดหมู่สร้างยอดขาย" eyebrow="ประสิทธิภาพตามหมวดหมู่" onMore={() => openPanel('categories', 'ประสิทธิภาพหมวดหมู่')}><div className="divide-y divide-slate-100">{report.categoryPerformance.slice(0, 5).map((row) => <div key={row.categoryName} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="truncate">{row.categoryName}</span><span className="shrink-0 font-semibold">{formatBaht(row.sales)}</span></div>)}{!report.categoryPerformance.length ? <Empty /> : null}</div></Panel>{report.filters.branchId === 'all' ? <Panel title="เปรียบเทียบสาขา" eyebrow="ยอดขายในช่วงที่เลือก" onMore={() => openPanel('branches', 'เปรียบเทียบสาขา')}><div className="divide-y divide-slate-100">{report.branchComparison.slice(0, 5).map((row) => <div key={row.branchId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><div><p className="font-medium">{row.branchName}</p><p className="text-[11px] text-slate-500">{row.transactions} บิล · สต๊อกเสี่ยง {row.stockRiskCount}</p></div><span className="shrink-0 font-semibold">{formatBaht(row.sales)}</span></div>)}{!report.branchComparison.length ? <Empty /> : null}</div></Panel> : <Panel title="ค่าใช้จ่าย" eyebrow="เงินออกจากร้าน"><div className="space-y-4 px-4 py-5"><div><p className="text-xs text-slate-500">จ่ายแล้ว</p><p className="mt-1 text-xl font-semibold text-slate-900">{formatBaht(report.kpis.paidExpenses)}</p></div><div><p className="text-xs text-slate-500">รอจ่าย / รออนุมัติ</p><p className="mt-1 text-xl font-semibold text-amber-800">{formatBaht(report.kpis.pendingExpenses)}</p></div></div></Panel>}</div>
      <Panel title="รายการขายล่าสุด" eyebrow="ตรวจสอบรายการย้อนหลัง" onMore={() => openPanel('sales', 'รายการขายทั้งหมด')}><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-2.5">เอกสาร</th><th className="px-4 py-2.5">เวลา</th><th className="px-4 py-2.5">ช่องทาง</th><th className="px-4 py-2.5">สินค้า/หน่วย</th><th className="px-4 py-2.5 text-right">ยอดรวม</th></tr></thead><tbody>{report.recentSales.slice(0, 8).map((sale) => <tr key={sale.id} className="border-t border-slate-100"><td className="px-4 py-3 font-medium">{sale.documentNumber}<p className="text-[11px] font-normal text-slate-500">{sale.customerName || 'ลูกค้าทั่วไป'}</p></td><td className="px-4 py-3 text-xs text-slate-500">{formatDate(sale.completedAt)}</td><td className="px-4 py-3">{sale.channel}</td><td className="max-w-[20rem] px-4 py-3 text-xs text-slate-600">{sale.items.slice(0, 2).map((item) => `${item.productName} · ${item.unitName} x${formatNumber(item.quantity)}`).join(', ') || '-'}</td><td className="px-4 py-3 text-right font-semibold">{formatBaht(sale.total)}</td></tr>)}{!report.recentSales.length ? <tr><td colSpan={5}><Empty /></td></tr> : null}</tbody></table></div></Panel>
    </div> : <div className="mt-5 border border-slate-200 bg-white"><Empty>ยังไม่มีข้อมูลรายงาน</Empty></div>}
    {drawer ? <ReportDrawer drawer={drawer} onClose={() => setDrawer(null)} /> : null}
  </main></CommerceShell>;
}

function ReportDrawer({ drawer, onClose }: { drawer: NonNullable<DrawerState>; onClose: () => void }) {
  const report = drawer.report;
  return <div className="fixed inset-0 z-50 bg-slate-950/35" onMouseDown={onClose}><aside role="dialog" aria-modal="true" aria-label={drawer.title} className="motion-drawer-right-in absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-slate-200 bg-white" onMouseDown={(event) => event.stopPropagation()}><header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-primary-800">รายละเอียดรายงาน</p><h2 className="mt-1 text-lg font-semibold">{drawer.title}</h2>{report ? <p className="mt-1 text-xs text-slate-500">{formatDate(report.filters.from)} – {formatDate(report.filters.to)}</p> : null}</div><button type="button" onClick={onClose} aria-label="ปิดรายละเอียด" className="grid h-8 w-8 place-items-center text-slate-500 hover:bg-slate-100"><X aria-hidden="true" className="h-4 w-4" /></button></header><div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-5">{drawer.loading ? <LoadingState /> : report ? <DrawerContent kind={drawer.kind} report={report} /> : <Empty>ไม่พบรายละเอียด</Empty>}</div></aside></div>;
}

function DrawerContent({ kind, report }: { kind: NonNullable<DrawerState>['kind']; report: CommerceReportResponse }) {
  if (kind === 'trend') return <div className="space-y-5"><div className="grid grid-cols-2 border border-slate-200"><div className="border-b border-r border-slate-200 p-4"><p className="text-xs text-slate-500">ยอดขาย</p><p className="mt-1 text-lg font-semibold">{formatBaht(report.kpis.netSales)}</p></div><div className="border-b border-slate-200 p-4"><p className="text-xs text-slate-500">จำนวนบิล</p><p className="mt-1 text-lg font-semibold">{formatNumber(report.kpis.bills)}</p></div><div className="border-r border-slate-200 p-4"><p className="text-xs text-slate-500">กำไรขั้นต้น</p><p className="mt-1 text-lg font-semibold">{report.kpis.grossProfit === null ? 'ต้นทุนยังไม่ครบ' : formatBaht(report.kpis.grossProfit)}</p></div><div className="p-4"><p className="text-xs text-slate-500">ค่าใช้จ่ายจ่ายแล้ว</p><p className="mt-1 text-lg font-semibold">{formatBaht(report.kpis.paidExpenses)}</p></div></div><SalesList rows={report.recentSales} /></div>;
  if (kind === 'topProducts') return <ProductTable rows={report.topProducts} />;
  if (kind === 'lowStock') return <StockTable rows={report.lowStock} />;
  if (kind === 'payments') return <div className="divide-y divide-slate-100 border border-slate-200">{report.paymentMix.map((row) => <div key={row.method} className="flex justify-between px-4 py-3 text-sm"><span>{row.label}<span className="ml-2 text-xs text-slate-400">{row.count} รายการ</span></span><strong>{formatBaht(row.amount)}</strong></div>)}</div>;
  if (kind === 'categories') return <div className="divide-y divide-slate-100 border border-slate-200">{report.categoryPerformance.map((row) => <div key={row.categoryName} className="flex justify-between px-4 py-3 text-sm"><span>{row.categoryName}</span><strong>{formatBaht(row.sales)}</strong></div>)}</div>;
  if (kind === 'branches') return <div className="divide-y divide-slate-100 border border-slate-200">{report.branchComparison.map((row) => <div key={row.branchId} className="flex items-center justify-between gap-4 px-4 py-3 text-sm"><div><p className="font-medium">{row.branchName}</p><p className="text-xs text-slate-500">{row.transactions} บิล · สต๊อกเสี่ยง {row.stockRiskCount}</p></div><div className="text-right"><p className="font-semibold">{formatBaht(row.sales)}</p><p className="text-xs text-emerald-700">{row.profit === null ? 'ต้นทุนยังไม่ครบ' : `กำไร ${formatBaht(row.profit)}`}</p></div></div>)}</div>;
  return <SalesList rows={report.recentSales} />;
}

function ProductTable({ rows }: { rows: CommerceReportResponse['topProducts'] }) {
  return <div className="overflow-x-auto border border-slate-200"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2.5">สินค้า/หน่วย</th><th className="px-3 py-2.5 text-right">จำนวน</th><th className="px-3 py-2.5 text-right">ยอดขาย</th><th className="px-3 py-2.5 text-right">กำไร</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.productId}:${row.productUnitId}:${row.branchName || ''}`} className="border-t border-slate-100"><td className="px-3 py-3"><div className="flex items-center gap-2"><ImageThumb src={row.imageUrl} alt={row.productName} /><span>{row.productName}<small className="block text-xs text-slate-500">{row.unitName}{row.branchName ? ` · ${row.branchName}` : ''}</small></span></div></td><td className="px-3 py-3 text-right">{formatNumber(row.quantity)}</td><td className="px-3 py-3 text-right font-medium">{formatBaht(row.sales)}</td><td className="px-3 py-3 text-right">{row.profit === null ? <span className="text-xs text-amber-700">ต้นทุนไม่ครบ</span> : formatBaht(row.profit)}</td></tr>)}</tbody></table>{!rows.length ? <Empty /> : null}</div>;
}

function StockTable({ rows }: { rows: CommerceReportResponse['lowStock'] }) {
  return <div className="divide-y divide-slate-100 border border-slate-200">{rows.map((row) => <div key={`${row.productId}:${row.productUnitId}:${row.branchName || ''}`} className="flex items-center gap-3 px-3 py-3"><ImageThumb src={row.imageUrl} alt={row.productName} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{row.productName} · {row.unitName}</p><p className="text-xs text-slate-500">{row.branchName || 'สาขาปัจจุบัน'} · จุดติดตาม {formatNumber(row.reorderPoint)}</p></div><span className={`text-sm font-semibold ${row.status === 'out' ? 'text-rose-700' : 'text-amber-700'}`}>{row.status === 'out' ? 'หมด' : formatNumber(row.available)}</span></div>)}{!rows.length ? <Empty>ไม่มีหน่วยที่ต้องติดตาม</Empty> : null}</div>;
}

function SalesList({ rows }: { rows: CommerceReportResponse['recentSales'] }) {
  return <div className="space-y-3">{rows.map((sale) => <article key={sale.id} className="border border-slate-200 p-4"><div className="flex justify-between gap-3"><div><p className="font-medium">{sale.documentNumber}</p><p className="text-xs text-slate-500">{sale.channel} · {formatDate(sale.completedAt)} · {sale.customerName || 'ลูกค้าทั่วไป'}</p></div><strong>{formatBaht(sale.total)}</strong></div><div className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-xs text-slate-600">{sale.items.map((item, index) => <div key={`${item.productName}:${index}`} className="flex justify-between gap-3 py-2"><span>{item.productName} · {item.unitName} x{formatNumber(item.quantity)}</span><span>{formatBaht(item.lineTotal)}</span></div>)}</div><p className="mt-2 text-[11px] text-slate-500">ชำระด้วย {sale.paymentMethods.join(', ') || 'ไม่ระบุ'}</p></article>)}{!rows.length ? <Empty>ยังไม่มีรายการขาย</Empty> : null}</div>;
}
