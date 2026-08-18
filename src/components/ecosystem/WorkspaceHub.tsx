'use client';

import Image from 'next/image';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ClipboardCheck,
  LogOut,
  Store,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { getLandingPath } from '@/lib/viewMode';
import { ROLE_LABELS } from '@/lib/constants';

function getInitials(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((name) => name.charAt(0))
    .join('');
}

function WorkspaceLoading() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f3f5f2] px-4">
      <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-primary-800" />
        <span>กำลังเตรียมพื้นที่ทำงาน…</span>
      </div>
    </main>
  );
}

export default function WorkspaceHub() {
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.currentUser);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const adminViewMode = useAuthStore((state) => state.adminViewMode);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated || !currentUser) {
    return <WorkspaceLoading />;
  }

  const roleLabel = ROLE_LABELS[currentUser.role];
  const initials = getInitials(currentUser.full_name) || 'PS';

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <main className="min-h-dvh bg-[#f3f5f2] text-slate-900">
      <header className="border-b border-slate-300 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-9 w-9 shrink-0 overflow-hidden border border-slate-200 bg-white">
              <Image src="/icons/PS.png" alt="PS Rice" width={36} height={36} priority className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-slate-900">PS Rice Wholesale</p>
              <p className="truncate text-[11px] text-slate-500">Operations Workspace</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 sm:flex">
              <span className="grid h-8 w-8 place-items-center bg-primary-50 text-xs font-semibold text-primary-900">
                {initials}
              </span>
              <span className="max-w-44 text-right">
                <span className="block truncate text-xs font-semibold text-slate-800">{currentUser.full_name}</span>
                <span className="block truncate text-[11px] text-slate-500">{roleLabel}</span>
              </span>
            </div>
            <span className="hidden h-7 w-px bg-slate-200 sm:block" />
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-9 items-center justify-center gap-2 border border-slate-300 bg-white px-3 text-xs font-medium text-slate-600 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
              aria-label="ออกจากระบบ"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-6xl flex-col px-4 sm:px-6 lg:px-8">
        <section className="flex-1 py-10 sm:py-14 lg:py-16">
          <div className="animate-fade-in border-b border-slate-300 pb-6 sm:flex sm:items-end sm:justify-between sm:gap-8">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-800">Workspace</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">เลือกพื้นที่ทำงาน</h1>
            </div>
            <p className="mt-3 text-sm text-slate-500 sm:mt-0">ระบบที่ได้รับสิทธิ์ 2 รายการ</p>
          </div>

          <div className="mt-6 overflow-hidden border border-slate-300 bg-white">
            <button
              type="button"
              onClick={() => router.push(getLandingPath(currentUser, adminViewMode))}
              className="group grid w-full gap-5 border-l-[3px] border-l-transparent px-5 py-6 text-left hover:border-l-primary-800 hover:bg-slate-50 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-primary-700 sm:grid-cols-[3rem_minmax(13rem,0.75fr)_minmax(16rem,1.25fr)_auto] sm:items-center sm:px-6"
            >
              <span className="grid h-12 w-12 place-items-center border border-slate-200 bg-slate-50 text-primary-800">
                <ClipboardCheck className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">01 · Workforce</span>
                <span className="mt-1 block text-xl font-semibold tracking-tight text-slate-900">ระบบจัดการงาน</span>
              </span>
              <span className="block text-sm leading-6 text-slate-600">
                ลงเวลา งานประจำวัน คำขอ การตรวจงาน และการบริหารทีม
              </span>
              <span className="flex items-center justify-between gap-4 sm:justify-end">
                <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  พร้อมใช้งาน
                </span>
                <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-primary-800" aria-hidden />
              </span>
            </button>

            <button
              type="button"
              onClick={() => router.push('/commerce/branches?next=/commerce')}
              className="group grid w-full gap-5 border-l-[3px] border-l-transparent border-t border-t-slate-200 px-5 py-6 text-left hover:border-l-primary-800 hover:bg-slate-50 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-primary-700 sm:grid-cols-[3rem_minmax(13rem,0.75fr)_minmax(16rem,1.25fr)_auto] sm:items-center sm:px-6"
            >
              <span className="grid h-12 w-12 place-items-center border border-slate-200 bg-slate-50 text-primary-800">
                <Store className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">02 · Commerce</span>
                <span className="mt-1 block text-xl font-semibold tracking-tight text-slate-900">ระบบขายสินค้าและ POS</span>
              </span>
              <span className="block text-sm leading-6 text-slate-600">
                ขายหน้าร้าน สินค้า สต๊อก จัดซื้อ และคำสั่งซื้อออนไลน์
              </span>
              <span className="flex items-center justify-between gap-4 sm:justify-end">
                <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  พร้อมใช้งาน
                </span>
                <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-primary-800" aria-hidden />
              </span>
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <span>การเข้าถึงข้อมูลเป็นไปตามบทบาทและสาขา</span>
            <span>เปลี่ยนระบบได้จากเมนูหลัก</span>
          </div>
        </section>

        <footer className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-t border-slate-300 py-4 text-xs text-slate-500">
          <p>PS Rice Ecosystem</p>
          <p>บัญชี: <span className="font-medium text-slate-700">{currentUser.full_name}</span></p>
        </footer>
      </div>
    </main>
  );
}
