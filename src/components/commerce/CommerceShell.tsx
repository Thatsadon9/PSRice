'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowDownToLine,
  Building2,
  Boxes,
  CalendarCheck,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Database,
  DatabaseBackup,
  Globe2,
  GraduationCap,
  HandCoins,
  Menu,
  MonitorCog,
  PackageSearch,
  ScrollText,
  Search,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Tags,
  Truck,
  UsersRound,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react';
import { getAccessToken } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

type CommerceShellProps = {
  children: React.ReactNode;
  section: 'pos' | 'pos-settings' | 'backoffice' | 'catalog-availability' | 'inventory' | 'purchasing' | 'goods-receipts' | 'transfers' | 'finance' | 'online-orders';
};

type CommerceContext = {
  branches: Array<{ id: string; name: string; code: string | null }>;
  selectedBranchId: string | null;
  selectedTerminalId: string | null;
  terminals: Array<{ id: string; code: string; name: string }>;
  sidebarCollapsed: boolean;
  permissions: string[];
};

type NavigationItem = { href: string; label: string; icon: LucideIcon; permission?: string };
type NavigationGroup = { label: string; icon: LucideIcon; items: NavigationItem[] };

const navigation: NavigationGroup[] = [
  { label: 'ขายหน้าร้าน', icon: ShoppingCart, items: [
    { href: '/pos', label: 'ขายหน้าร้าน', icon: ShoppingCart, permission: 'pos.sell' },
    { href: '/backoffice/online-orders', label: 'ออเดอร์เว็บ', icon: Globe2 },
    { href: '/backoffice/daily-closing', label: 'ปิดยอดประจำวัน', icon: CalendarCheck, permission: 'pos.daily_close' },
  ] },
  { label: 'ภาพรวมร้านค้า', icon: ChartNoAxesCombined, items: [
    { href: '/backoffice/reports', label: 'รายงานร้านค้า', icon: ChartNoAxesCombined, permission: 'reports.view' },
    { href: '/backoffice/finance', label: 'การเงิน', icon: WalletCards, permission: 'finance.read' },
  ] },
  { label: 'บริหารสต๊อก', icon: Boxes, items: [
    { href: '/backoffice', label: 'สินค้าและบริการ', icon: Boxes, permission: 'catalog.read' },
    { href: '/backoffice/inventory', label: 'บริหารสต๊อกสินค้า', icon: PackageSearch, permission: 'inventory.read' },
    { href: '/backoffice/stock-adjustments', label: 'ตรวจนับ / ปรับปรุงสต๊อก', icon: ClipboardCheck, permission: 'inventory.read' },
    { href: '/backoffice/purchasing', label: 'ใบสั่งซื้อ (PO)', icon: Truck, permission: 'purchasing.manage' },
    { href: '/backoffice/goods-receipts', label: 'ใบนำเข้าสินค้า', icon: ArrowDownToLine, permission: 'purchasing.receive' },
    { href: '/backoffice/transfers', label: 'รับ–โอนสินค้า', icon: ArrowLeftRight, permission: 'inventory.transfer' },
  ] },
  { label: 'บริหารข้อมูลกลาง', icon: Database, items: [
    { href: '/backoffice/suppliers', label: 'ผู้ขาย / คู่ค้า', icon: Building2, permission: 'purchasing.manage' },
    { href: '/backoffice/customers', label: 'ลูกค้าและสมาชิก', icon: UsersRound, permission: 'crm.read' },
    { href: '/backoffice/promotions', label: 'โปรโมชั่นและคูปอง', icon: Tags, permission: 'promotion.manage' },
    { href: '/backoffice/commissions', label: 'คอมมิชชัน', icon: HandCoins },
  ] },
  { label: 'บริหารร้านค้า', icon: Store, items: [
    { href: '/backoffice/pos-settings', label: 'ตั้งค่า POS', icon: SlidersHorizontal, permission: 'pos.manage_settings' },
    { href: '/backoffice/terminals', label: 'เครื่อง POS', icon: MonitorCog, permission: 'pos.manage_terminals' },
    { href: '/backoffice/access', label: 'สิทธิ์การใช้งาน', icon: ShieldCheck, permission: 'system.manage_commerce_access' },
    { href: '/backoffice/audit', label: 'ประวัติการแก้ไข', icon: ScrollText, permission: 'audit.view' },
  ] },
  { label: 'ช่วยเหลือ', icon: CircleHelp, items: [
    { href: '/commerce/onboarding', label: 'คู่มือย้ายจาก POSVis', icon: GraduationCap },
    { href: '/backoffice/migration', label: 'ย้ายข้อมูล POSVis', icon: DatabaseBackup, permission: 'migration.manage' },
  ] },
];

const CommerceShellBoundary = createContext(false);
const CONTEXT_CACHE_TTL = 5 * 60 * 1000;
let contextCache: { userId: string; value: CommerceContext; savedAt: number } | null = null;
let contextRequest: { userId: string; promise: Promise<CommerceContext> } | null = null;

async function request(path: string, init?: RequestInit) {
  const accessToken = await getAccessToken();
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || 'ทำรายการไม่สำเร็จ'), { status: response.status, body });
  return body;
}

function readCachedContext(userId?: string) {
  return userId && contextCache?.userId === userId ? contextCache : null;
}

function rememberContext(userId: string, value: CommerceContext) {
  contextCache = { userId, value, savedAt: Date.now() };
}

async function fetchContext(userId: string) {
  if (contextRequest?.userId === userId) return contextRequest.promise;
  const promise = request('/api/commerce/context') as Promise<CommerceContext>;
  contextRequest = { userId, promise };
  try {
    return await promise;
  } finally {
    if (contextRequest?.promise === promise) contextRequest = null;
  }
}

export function clearCommerceContextCache() {
  contextCache = null;
  contextRequest = null;
}

export function getCachedCommerceBranchId() {
  return contextCache?.value.selectedBranchId || null;
}

export function CommerceShell(props: CommerceShellProps) {
  const isNested = useContext(CommerceShellBoundary);
  if (isNested) return <>{props.children}</>;
  return <CommerceShellRoot {...props} />;
}

function CommerceShellRoot({ children, section }: CommerceShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentUser = useAuthStore((state) => state.currentUser);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const logout = useAuthStore((state) => state.logout);
  const currentUserId = currentUser?.id;
  const initialContext = readCachedContext(currentUser?.id)?.value || null;
  const [context, setContext] = useState<CommerceContext | null>(initialContext);
  const [collapsed, setCollapsed] = useState(initialContext?.sidebarCollapsed || false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [posMenuOpen, setPosMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [contextError, setContextError] = useState('');

  const loadContext = useCallback(async (force = false) => {
    if (!currentUserId) return;
    const cached = readCachedContext(currentUserId);
    if (cached) {
      setContext(cached.value);
      setCollapsed(cached.value.sidebarCollapsed);
      if (!force && Date.now() - cached.savedAt < CONTEXT_CACHE_TTL) return;
    }
    try {
      const next = await fetchContext(currentUserId);
      setContextError('');
      if (!next.selectedBranchId) {
        router.replace(`/commerce/branches?next=${encodeURIComponent(pathname)}`);
        return;
      }
      rememberContext(currentUserId, next);
      setContext(next);
      setCollapsed(next.sidebarCollapsed);
    } catch (error) {
      setContextError(error instanceof Error ? error.message : 'โหลดข้อมูลสาขาไม่สำเร็จ');
    }
  }, [currentUserId, pathname, router]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
    if (!isAuthenticated) return;
    const timeoutId = window.setTimeout(() => { void loadContext(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isAuthenticated, isLoading, loadContext, router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
      if (event.key === 'F11') {
        event.preventDefault();
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setPosMenuOpen(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const visibleNavigation = useMemo(() => navigation.map((group) => ({ ...group, items: group.items.filter((item) => !item.permission || context?.permissions.includes(item.permission)) })).filter((group) => group.items.length), [context?.permissions]);
  const commandItems = useMemo(() => visibleNavigation.flatMap((group) => group.items).filter((item) => item.label.toLocaleLowerCase().includes(commandQuery.trim().toLocaleLowerCase())), [commandQuery, visibleNavigation]);
  const selectedBranch = context?.branches.find((branch) => branch.id === context.selectedBranchId);
  const selectedTerminal = context?.terminals.find((terminal) => terminal.id === context.selectedTerminalId);

  if (isLoading || !isAuthenticated || !currentUser) {
    return <div className="grid min-h-dvh place-items-center bg-[#f4f5f4] px-5 text-center text-sm text-slate-500">กำลังตรวจสอบบัญชีผู้ใช้…</div>;
  }

  if (!context) {
    return <CommerceShellBoundary.Provider value><ShellWarmup section={section} error={contextError} onRetry={() => void loadContext(true)}>{children}</ShellWarmup></CommerceShellBoundary.Provider>;
  }

  const signOut = async () => {
    clearCommerceContextCache();
    await logout();
    router.replace('/login');
  };
  const saveCollapsed = (value: boolean) => {
    setCollapsed(value);
    const next = { ...context, sidebarCollapsed: value };
    setContext(next);
    rememberContext(currentUser.id, next);
    void request('/api/commerce/context', { method: 'PATCH', body: JSON.stringify({ sidebar_collapsed: value }) });
  };
  const header = <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white"><div className="flex h-14 items-center gap-3 px-3 sm:px-4">
    {section === 'pos' ? <button type="button" onClick={() => setPosMenuOpen(true)} className="inline-flex h-9 items-center gap-2 border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" aria-label="เปิดเมนู Commerce"><Menu aria-hidden="true" className="h-4 w-4" /><span className="hidden sm:inline">เมนู</span></button> : <button type="button" onClick={() => { if (window.matchMedia('(max-width: 767px)').matches) setMobileMenuOpen(true); else saveCollapsed(!collapsed); }} className="grid h-9 w-9 shrink-0 place-items-center border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50" aria-label={collapsed ? 'ขยายเมนู' : 'เปิดเมนู Commerce'}><Menu aria-hidden="true" className="h-4 w-4 md:hidden" /><span className="hidden md:inline-flex">{collapsed ? <ChevronRight aria-hidden="true" className="h-4 w-4" /> : <ChevronLeft aria-hidden="true" className="h-4 w-4" />}</span></button>}
    <Link href="/commerce" className="flex shrink-0 items-center gap-2" aria-label="หน้าเริ่มต้น Commerce"><Image src="/icons/PS.png" alt="PS Rice" width={30} height={30} className="h-7.5 w-7.5 rounded-md object-cover" priority /><span className="hidden text-sm font-bold tracking-tight sm:inline">PS Rice Commerce</span></Link>
    <span className="h-6 w-px bg-slate-200" />
    <div className="flex min-w-0 items-center gap-2" aria-label={`สาขาที่กำลังใช้งาน ${selectedBranch?.name || ''}`}><Store aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-800" /><div className="min-w-0"><p className="hidden text-[10px] leading-none text-slate-400 lg:block">สาขาที่กำลังใช้งาน</p><p className="max-w-[8rem] truncate text-sm font-semibold text-slate-800 sm:max-w-[13rem]">{selectedBranch?.code ? `${selectedBranch.code} — ` : ''}{selectedBranch?.name}</p></div></div>
    <Link href={`/commerce/branches?next=${encodeURIComponent(pathname)}`} className="hidden whitespace-nowrap text-[11px] font-medium text-primary-800 hover:underline sm:inline">เปลี่ยนสาขา</Link>
    {selectedTerminal ? <span className="hidden text-xs text-slate-500 lg:inline">เครื่อง {selectedTerminal.code} · {selectedTerminal.name}</span> : <Link href="/backoffice/terminals" className="hidden text-xs font-medium text-amber-700 lg:inline">ยังไม่ระบุเครื่อง</Link>}
    <button type="button" onClick={() => setCommandOpen(true)} className="ml-auto hidden h-8 min-w-52 items-center gap-2 border border-slate-200 bg-slate-50 px-3 text-xs text-slate-500 md:flex"><Search aria-hidden="true" className="h-3.5 w-3.5" /><span>ค้นหาสินค้า ลูกค้า บิล เมนู</span><kbd className="ml-auto font-sans">⌘K</kbd></button>
    <span className="hidden truncate text-xs text-slate-500 xl:inline">{currentUser.full_name}</span><Link href="/hub" className="hidden whitespace-nowrap text-xs font-medium text-slate-600 hover:text-primary-800 sm:inline">สลับระบบ</Link><button type="button" onClick={signOut} className="hidden whitespace-nowrap text-xs font-medium text-slate-600 hover:text-red-700 sm:inline">ออก</button>
  </div>{contextError ? <p className="bg-amber-50 px-4 py-1.5 text-xs text-amber-800">{contextError}</p> : null}</header>;

  return <CommerceShellBoundary.Provider value><div className="min-h-dvh overflow-x-hidden bg-[#f4f5f4] text-slate-900">{header}{section === 'pos' ? children : <div className="flex min-h-[calc(100dvh-3.5rem)]">
    <aside className={`app-scrollbar no-print sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 overflow-y-auto border-r border-slate-200 bg-white transition-[width] md:block ${collapsed ? 'w-16' : 'w-64'}`}><div className={`flex min-h-12 items-center border-b border-slate-200 px-3 ${collapsed ? 'justify-center' : 'gap-2.5'}`}><Store aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />{!collapsed ? <p className="truncate text-xs font-semibold text-slate-600">{selectedBranch?.name}</p> : null}</div><ShellNavigation groups={visibleNavigation} pathname={pathname} collapsed={collapsed} onExpand={() => saveCollapsed(false)} /></aside>
    <div className="min-w-0 flex-1">{children}</div>
  </div>}
  {section !== 'pos' && mobileMenuOpen ? <><button type="button" className="fixed inset-0 z-40 bg-slate-950/35" aria-label="ปิดเมนู Commerce" onClick={() => setMobileMenuOpen(false)} /><aside role="dialog" aria-modal="true" aria-label="เมนู Commerce" className="motion-drawer-left-in no-print fixed inset-y-0 left-0 z-50 flex w-[min(20rem,88vw)] flex-col border-r border-slate-200 bg-white shadow-2xl"><div className="flex h-14 items-center gap-3 border-b border-slate-200 px-4"><Image src="/icons/PS.png" alt="PS Rice" width={30} height={30} className="h-7.5 w-7.5 rounded-md object-cover" /><div className="min-w-0"><p className="text-sm font-bold">PS Rice Commerce</p><p className="truncate text-[11px] text-slate-500">{selectedBranch?.name}</p></div><button type="button" onClick={() => setMobileMenuOpen(false)} className="ml-auto grid h-8 w-8 place-items-center text-slate-500 hover:bg-slate-100" aria-label="ปิดเมนู"><X aria-hidden="true" className="h-4 w-4" /></button></div><div className="app-scrollbar min-h-0 flex-1 overflow-y-auto"><ShellNavigation groups={visibleNavigation} pathname={pathname} onNavigate={() => setMobileMenuOpen(false)} /></div><div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500"><Link href="/hub" onClick={() => setMobileMenuOpen(false)} className="font-medium text-slate-700 hover:text-primary-800">สลับระบบ</Link><button type="button" onClick={signOut} className="ml-4 font-medium text-slate-600 hover:text-red-700">ออก</button></div></aside></> : null}
  {section === 'pos' && posMenuOpen ? <><button type="button" className="fixed inset-0 z-40 bg-slate-950/35" aria-label="ปิดเมนู Commerce" onClick={() => setPosMenuOpen(false)} /><aside role="dialog" aria-modal="true" aria-label="เมนู Commerce" className="motion-drawer-left-in no-print fixed inset-y-0 left-0 z-50 flex w-[min(20rem,88vw)] flex-col bg-white shadow-2xl"><div className="flex h-14 items-center gap-3 border-b border-slate-200 px-4"><Image src="/icons/PS.png" alt="PS Rice" width={30} height={30} className="h-7.5 w-7.5 rounded-md object-cover" /><div className="min-w-0"><p className="text-sm font-bold">PS Rice Commerce</p><p className="truncate text-[11px] text-slate-500">{selectedBranch?.name}</p></div><button type="button" onClick={() => setPosMenuOpen(false)} className="ml-auto grid h-8 w-8 place-items-center text-slate-500 hover:bg-slate-100" aria-label="ปิดเมนู"><X aria-hidden="true" className="h-4 w-4" /></button></div><div className="app-scrollbar min-h-0 flex-1 overflow-y-auto"><ShellNavigation groups={visibleNavigation} pathname={pathname} onNavigate={() => setPosMenuOpen(false)} /></div><div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500"><p>{selectedTerminal ? `เครื่อง ${selectedTerminal.code} · ${selectedTerminal.name}` : 'ยังไม่ระบุเครื่อง POS'}</p><button type="button" onClick={() => { setPosMenuOpen(false); setCommandOpen(true); }} className="mt-2 inline-flex items-center gap-2 font-medium text-primary-800"><Search aria-hidden="true" className="h-3.5 w-3.5" />ค้นหาเมนูด้วย ⌘K</button></div></aside></> : null}
  {commandOpen ? <div className="fixed inset-0 z-50 bg-slate-950/35 px-4 pt-[12vh]" onMouseDown={() => setCommandOpen(false)}><section role="dialog" aria-modal="true" aria-label="ค้นหาใน Commerce" className="motion-dialog-in mx-auto max-w-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center gap-2 border-b border-slate-200 px-4"><Search aria-hidden="true" className="h-5 w-5 text-slate-400" /><input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="พิมพ์ชื่อเมนู เช่น สต๊อก, จัดซื้อ, รายงาน…" className="h-14 w-full border-0 px-1 text-base outline-none" /></div><div className="max-h-[50vh] overflow-y-auto py-2">{commandItems.map((item) => { const Icon = item.icon; return <button key={item.href} type="button" onClick={() => { setCommandOpen(false); router.push(item.href); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50"><Icon aria-hidden="true" className="h-4.5 w-4.5 text-slate-400" /><span>{item.label}</span><span className="ml-auto text-xs text-slate-400">เปิด</span></button>; })}{!commandItems.length ? <p className="px-4 py-10 text-center text-sm text-slate-500">ไม่พบเมนูที่ค้นหา</p> : null}</div></section></div> : null}</div></CommerceShellBoundary.Provider>;
}

function isNavigationItemActive(pathname: string, href: string) {
  return pathname === href || (href !== '/backoffice' && pathname.startsWith(`${href}/`));
}

function ShellNavigation({ groups, pathname, collapsed = false, onNavigate, onExpand }: { groups: NavigationGroup[]; pathname: string; collapsed?: boolean; onNavigate?: () => void; onExpand?: () => void }) {
  const router = useRouter();
  const activeGroup = groups.find((group) => group.items.some((item) => isNavigationItemActive(pathname, item.href)))?.label;
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroup || groups[0]?.label || null);

  useEffect(() => {
    if (!activeGroup) return;
    const frame = window.requestAnimationFrame(() => setOpenGroup(activeGroup));
    return () => window.cancelAnimationFrame(frame);
  }, [activeGroup]);

  const prefetchGroup = (group: NavigationGroup) => {
    group.items.forEach((item) => router.prefetch(item.href));
  };

  const toggleGroup = (label: string) => {
    if (collapsed) {
      setOpenGroup(label);
      onExpand?.();
      return;
    }
    setOpenGroup((current) => current === label ? null : label);
  };

  return <nav className="py-2" aria-label="เมนู Commerce">{groups.map((group, groupIndex) => {
    const GroupIcon = group.icon;
    const containsActiveItem = group.items.some((item) => isNavigationItemActive(pathname, item.href));
    const expanded = !collapsed && openGroup === group.label;
    const regionId = `commerce-nav-group-${groupIndex}`;
    return <div key={group.label}>
      <button type="button" onClick={() => toggleGroup(group.label)} onMouseEnter={() => prefetchGroup(group)} onFocus={() => prefetchGroup(group)} aria-expanded={expanded} aria-controls={regionId} title={collapsed ? group.label : undefined} className={`group flex h-11 w-full items-center border-l-[3px] text-left text-sm font-semibold transition-colors ${containsActiveItem ? 'border-primary-800 text-primary-900' : 'border-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-950'} ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'}`}>
        <GroupIcon aria-hidden="true" strokeWidth={containsActiveItem ? 2.25 : 1.8} className={`h-[19px] w-[19px] shrink-0 transition-[color,transform] duration-150 group-hover:scale-105 ${containsActiveItem ? 'text-primary-800' : 'text-slate-400 group-hover:text-slate-600'}`} />
        {!collapsed ? <><span className="min-w-0 flex-1 truncate">{group.label}</span><ChevronDown aria-hidden="true" className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-0' : '-rotate-90'}`} /></> : <span className="sr-only">{group.label}</span>}
      </button>
      <div id={regionId} aria-hidden={!expanded} className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0'}`}><div className="min-h-0 overflow-hidden pb-1">{group.items.map((item) => {
        const active = isNavigationItemActive(pathname, item.href);
        const Icon = item.icon;
        return <Link key={item.href} href={item.href} tabIndex={expanded ? undefined : -1} onMouseEnter={() => router.prefetch(item.href)} onFocus={() => router.prefetch(item.href)} onClick={() => { setOpenGroup(group.label); onNavigate?.(); }} aria-current={active ? 'page' : undefined} className={`group flex min-h-10 items-center gap-3 border-l-[3px] py-2 pl-9 pr-4 text-sm transition-[color,background-color,border-color,transform] duration-150 ${active ? 'border-primary-800 bg-primary-50 font-semibold text-primary-900' : 'border-transparent text-slate-600 hover:translate-x-0.5 hover:bg-slate-50 hover:text-slate-900'}`}><Icon aria-hidden="true" strokeWidth={active ? 2.25 : 1.8} className={`h-[17px] w-[17px] shrink-0 transition-colors ${active ? 'text-primary-800' : 'text-slate-400 group-hover:text-slate-600'}`} /><span className="min-w-0 truncate">{item.label}</span></Link>;
      })}</div></div>
    </div>;
  })}</nav>;
}

function ShellWarmup({ children, section, error, onRetry }: { children: React.ReactNode; section: CommerceShellProps['section']; error: string; onRetry: () => void }) {
  return <div className="min-h-dvh overflow-x-hidden bg-[#f4f5f4] text-slate-900"><header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-4"><span className="grid h-8 w-8 place-items-center border border-slate-200 text-slate-400">{section === 'pos' ? <Menu aria-hidden="true" className="h-4 w-4" /> : <ChevronLeft aria-hidden="true" className="h-4 w-4" />}</span><Image src="/icons/PS.png" alt="PS Rice" width={30} height={30} className="h-7.5 w-7.5 rounded-md object-cover" priority /><span className="text-sm font-bold">PS Rice Commerce</span><span className="ml-auto inline-flex items-center gap-2 text-xs text-slate-500"><span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-primary-800" />กำลังเชื่อมต่อสาขา…</span></header>{error ? <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900"><span>{error}</span><button type="button" onClick={onRetry} className="shrink-0 font-semibold">ลองใหม่</button></div> : null}<div className="flex min-h-[calc(100dvh-3.5rem)]">{section !== 'pos' ? <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-4 md:block" aria-hidden><div className="h-3 w-28 animate-pulse rounded bg-slate-200" /><div className="mt-6 space-y-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-slate-100" style={{ width: `${58 + (index % 3) * 13}%` }} />)}</div></aside> : null}<div className="min-w-0 flex-1">{children}</div></div></div>;
}
