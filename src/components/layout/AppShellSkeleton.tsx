import type { ReactNode } from 'react';
import Skeleton from '@/components/ui/Skeleton';

interface RouteSkeletonProps {
  pathname?: string | null;
}

const navRows = ['w-36', 'w-28', 'w-32', 'w-24', 'w-32', 'w-32', 'w-28', 'w-24', 'w-28'];
const range = (count: number) => Array.from({ length: count }, (_, index) => index);

export function RootLoadingSkeleton() {
  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-8">
      <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="mt-8 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full rounded-2xl" />
          </div>
        </div>
        <span className="sr-only" role="status">
          กำลังโหลดหน้า
        </span>
      </div>
    </div>
  );
}

export function ManagerAppSkeleton({ pathname }: RouteSkeletonProps) {
  return (
    <div className="flex min-h-dvh bg-slate-50">
      <ManagerSidebarSkeleton />
      <div className="flex min-w-0 flex-1 flex-col">
        <ManagerHeaderSkeleton />
        <main className="flex-1 overflow-hidden pb-24 lg:pb-0">
          <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">
            <ManagerPageSkeleton pathname={pathname} />
          </div>
        </main>
        <ManagerMobileNavSkeleton />
      </div>
      <span className="sr-only" role="status">
        กำลังโหลดข้อมูลผู้จัดการ
      </span>
    </div>
  );
}

export function ManagerPageSkeleton({ pathname }: RouteSkeletonProps) {
  const path = pathname ?? '';

  if (path.startsWith('/manager/review/') && path !== '/manager/review') return <ManagerReviewDetailSkeleton />;
  if (path.startsWith('/manager/review')) return <ManagerReviewSkeleton />;
  if (path.startsWith('/manager/requests')) return <ManagerRequestsSkeleton />;
  if (path.startsWith('/manager/employees')) return <ManagerEmployeesSkeleton />;
  if (path.startsWith('/manager/branches')) return <ManagerBranchesSkeleton />;
  if (path.startsWith('/manager/schedule')) return <ManagerScheduleSkeleton />;
  if (path.startsWith('/manager/check-in') || path.startsWith('/manager/attendance')) return <ManagerAttendanceSkeleton />;
  if (path.startsWith('/manager/templates')) return <ManagerTemplatesSkeleton />;
  if (path.startsWith('/manager/assignments')) return <ManagerAssignmentsSkeleton />;
  if (path.startsWith('/manager/payroll')) return <ManagerPayrollSkeleton />;
  if (path.startsWith('/manager/reports')) return <ManagerReportsSkeleton />;
  if (path.startsWith('/manager/settings')) return <ManagerSettingsSkeleton />;
  if (path.startsWith('/manager/notifications')) return <ManagerNotificationsSkeleton />;
  if (path.startsWith('/manager/more')) return <ManagerMoreSkeleton />;

  return <ManagerDashboardSkeleton />;
}

export function EmployeeAppSkeleton({ pathname }: RouteSkeletonProps) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <EmployeeHeaderSkeleton />
      <main className="mx-auto w-full max-w-lg pb-24">
        <EmployeePageSkeleton pathname={pathname} />
      </main>
      <EmployeeBottomNavSkeleton />
      <span className="sr-only" role="status">
        กำลังโหลดข้อมูลพนักงาน
      </span>
    </div>
  );
}

export function EmployeePageSkeleton({ pathname }: RouteSkeletonProps) {
  const path = pathname ?? '';

  if (path.startsWith('/employee/tasks/') && path !== '/employee/tasks') return <EmployeeTaskDetailSkeleton />;
  if (path.startsWith('/employee/tasks')) return <EmployeeTasksSkeleton />;
  if (path.startsWith('/employee/check-in')) return <EmployeeCheckInSkeleton />;
  if (path.startsWith('/employee/history')) return <EmployeeHistorySkeleton />;
  if (path.startsWith('/employee/requests')) return <EmployeeRequestsSkeleton />;
  if (path.startsWith('/employee/schedule')) return <EmployeeScheduleSkeleton />;
  if (path.startsWith('/employee/profile')) return <EmployeeProfileSkeleton />;
  if (path.startsWith('/employee/settings')) return <EmployeeSettingsSkeleton />;
  if (path.startsWith('/employee/notifications')) return <EmployeeNotificationsSkeleton />;

  return <EmployeeHomeSkeleton />;
}

function ManagerSidebarSkeleton() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-5 lg:block">
      <div className="mb-8 flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="space-y-2">
        {navRows.map((width, index) => (
          <div key={index} className="flex h-11 items-center gap-3 rounded-2xl px-3">
            <Skeleton className="h-5 w-5 rounded-md" />
            <Skeleton className={`h-3 ${width}`} />
          </div>
        ))}
      </div>
    </aside>
  );
}

function ManagerHeaderSkeleton() {
  return (
    <header className="h-16 border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-xl lg:hidden" />
          <Skeleton className="hidden h-10 w-10 rounded-full lg:block" />
          <div className="hidden space-y-2 sm:block">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="hidden h-10 w-40 rounded-2xl md:block" />
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
      </div>
    </header>
  );
}

function ManagerMobileNavSkeleton() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-5 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] lg:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-between">
        {range(5).map((item) => (
          <div key={item} className="flex flex-col items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-xl" />
            <Skeleton className="h-2 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmployeeHeaderSkeleton() {
  return (
    <header className="h-16 border-b border-slate-200 bg-white px-4">
      <div className="mx-auto flex h-full max-w-lg items-center justify-between">
        <Skeleton className="h-11 w-11 rounded-full" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
      </div>
    </header>
  );
}

function EmployeeBottomNavSkeleton() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around rounded-[2rem] border border-slate-100 bg-white px-3 shadow-[0_-10px_40px_rgba(15,23,42,0.12)]">
        {range(5).map((item) => (
          <div key={item} className="flex flex-col items-center gap-2">
            <Skeleton className={item === 2 ? 'h-12 w-12 rounded-full' : 'h-7 w-7 rounded-xl'} />
            <Skeleton className="h-2 w-9" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PageHeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {action && <Skeleton className="h-12 w-44 rounded-2xl" />}
    </div>
  );
}

function StatCardSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton className="h-12 w-12 rounded-2xl" />
      </div>
      {tall && <Skeleton className="mt-6 h-2 w-full rounded-full" />}
    </div>
  );
}

function StatsGridSkeleton({ count = 4, tall = false }: { count?: number; tall?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {range(count).map((item) => (
        <StatCardSkeleton key={item} tall={tall} />
      ))}
    </div>
  );
}

function PanelSkeleton({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function FilterBarSkeleton({ dense = false }: { dense?: boolean }) {
  return (
    <PanelSkeleton>
      <div className="grid gap-3 md:grid-cols-12">
        <Skeleton className="h-11 md:col-span-4" />
        <Skeleton className="h-11 md:col-span-2" />
        <Skeleton className="h-11 md:col-span-2" />
        <Skeleton className="h-11 md:col-span-2" />
        <Skeleton className="h-11 md:col-span-2" />
      </div>
      {!dense && (
        <div className="mt-4 flex flex-wrap gap-2">
          {range(6).map((item) => (
            <Skeleton key={item} className="h-10 w-24 rounded-full" />
          ))}
        </div>
      )}
    </PanelSkeleton>
  );
}

function TableSkeleton({ rows = 5, compact = false }: { rows?: number; compact?: boolean }) {
  return (
    <PanelSkeleton className="overflow-hidden p-0">
      <div className="grid grid-cols-12 gap-4 border-b border-slate-100 px-5 py-4">
        <Skeleton className="col-span-3 h-3" />
        <Skeleton className="col-span-4 h-3" />
        <Skeleton className="col-span-2 h-3" />
        <Skeleton className="col-span-2 h-3" />
        <Skeleton className="col-span-1 h-3" />
      </div>
      <div className="divide-y divide-slate-100">
        {range(rows).map((row) => (
          <div key={row} className="grid grid-cols-12 items-center gap-4 px-5 py-5">
            <div className="col-span-3 flex items-center gap-3">
              <Skeleton className="h-11 w-11 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2 w-16" />
              </div>
            </div>
            <div className="col-span-4 space-y-2">
              <Skeleton className="h-3 w-4/5" />
              {!compact && <Skeleton className="h-2 w-3/5" />}
            </div>
            <Skeleton className="col-span-2 h-10 rounded-2xl" />
            <Skeleton className="col-span-2 h-10 rounded-2xl" />
            <Skeleton className="col-span-1 h-9 w-9 rounded-full" />
          </div>
        ))}
      </div>
    </PanelSkeleton>
  );
}

function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {range(count).map((item) => (
        <PanelSkeleton key={item} className="min-h-56">
          <div className="flex items-start justify-between">
            <Skeleton className="h-11 w-11 rounded-2xl" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-7 w-16 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
          </div>
          <Skeleton className="mt-6 h-px w-full rounded-none" />
          <div className="mt-4 flex justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </PanelSkeleton>
      ))}
    </div>
  );
}

function ManagerDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatsGridSkeleton tall />
      <div className="grid gap-5 lg:grid-cols-3">
        <PanelSkeleton className="lg:col-span-2">
          <Skeleton className="h-5 w-44" />
          <div className="mt-5 grid gap-3">
            {range(5).map((item) => (
              <Skeleton key={item} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        </PanelSkeleton>
        <PanelSkeleton>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-5 h-56 w-full rounded-2xl" />
        </PanelSkeleton>
      </div>
    </div>
  );
}

function ManagerReviewSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {range(5).map((item) => (
          <StatCardSkeleton key={item} />
        ))}
      </div>
      <FilterBarSkeleton />
      <div className="space-y-3">
        {range(7).map((item) => (
          <PanelSkeleton key={item} className="p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-2xl" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-64 max-w-full" />
                  <Skeleton className="h-3 w-44" />
                </div>
              </div>
              <Skeleton className="h-9 w-24 rounded-full" />
            </div>
          </PanelSkeleton>
        ))}
      </div>
    </div>
  );
}

function ManagerReviewDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-6 w-28" />
      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        <PanelSkeleton>
          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-14 w-14 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-3 w-72 max-w-full" />
              </div>
            </div>
          </div>
          <Skeleton className="mt-7 h-4 w-32" />
          <Skeleton className="mt-4 h-36 w-56 rounded-2xl" />
          <Skeleton className="my-6 h-px w-full rounded-none" />
          <Skeleton className="h-4 w-44" />
          <Skeleton className="mt-4 h-16 w-full rounded-2xl" />
        </PanelSkeleton>
        <PanelSkeleton>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-5 h-12 w-full rounded-2xl" />
          <Skeleton className="mt-5 h-56 w-full rounded-3xl" />
          <Skeleton className="mt-5 h-28 w-full rounded-2xl" />
          <div className="mt-5 space-y-3">
            <Skeleton className="h-12 w-full rounded-2xl" />
            <Skeleton className="h-12 w-full rounded-2xl" />
          </div>
        </PanelSkeleton>
      </div>
    </div>
  );
}

function ManagerRequestsSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <StatsGridSkeleton count={3} />
      <FilterBarSkeleton dense />
      <TableSkeleton rows={6} />
    </div>
  );
}

function ManagerEmployeesSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatsGridSkeleton count={4} />
      <FilterBarSkeleton dense />
      <TableSkeleton rows={8} />
    </div>
  );
}

function ManagerBranchesSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {range(6).map((item) => (
          <PanelSkeleton key={item}>
            <div className="flex items-start justify-between">
              <Skeleton className="h-12 w-12 rounded-2xl" />
              <Skeleton className="h-9 w-20 rounded-full" />
            </div>
            <div className="mt-6 space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-32" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
            </div>
          </PanelSkeleton>
        ))}
      </div>
    </div>
  );
}

function ManagerScheduleSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatsGridSkeleton count={3} />
      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <PanelSkeleton>
          <Skeleton className="h-5 w-40" />
          <div className="mt-5 grid grid-cols-7 gap-2">
            {range(35).map((item) => (
              <Skeleton key={item} className="aspect-square rounded-xl" />
            ))}
          </div>
        </PanelSkeleton>
        <PanelSkeleton>
          <Skeleton className="h-5 w-48" />
          <div className="mt-5 space-y-3">
            {range(6).map((item) => (
              <Skeleton key={item} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        </PanelSkeleton>
      </div>
    </div>
  );
}

function ManagerAttendanceSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatsGridSkeleton count={4} />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <PanelSkeleton>
          <Skeleton className="h-5 w-48" />
          <div className="mt-5 space-y-3">
            {range(7).map((item) => (
              <Skeleton key={item} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        </PanelSkeleton>
        <PanelSkeleton>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-5 h-72 w-full rounded-3xl" />
        </PanelSkeleton>
      </div>
    </div>
  );
}

function ManagerTemplatesSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Skeleton className="h-12 w-full sm:w-56" />
        <Skeleton className="h-12 w-full sm:w-36" />
      </div>
      <CardGridSkeleton count={9} />
    </div>
  );
}

function ManagerAssignmentsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <PageHeaderSkeleton />
        <PanelSkeleton className="min-w-72">
          <div className="flex items-center justify-between gap-5">
            <div className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-7 w-16" />
            </div>
            <Skeleton className="h-12 w-44 rounded-2xl" />
          </div>
        </PanelSkeleton>
      </div>
      <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
        <PanelSkeleton>
          <Skeleton className="h-5 w-32" />
          <div className="mt-6 space-y-4">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </div>
        </PanelSkeleton>
        <div className="space-y-5">
          <FilterBarSkeleton />
          <TableSkeleton rows={7} />
        </div>
      </div>
    </div>
  );
}

function ManagerPayrollSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <StatsGridSkeleton count={4} tall />
      <TableSkeleton rows={7} />
    </div>
  );
}

function ManagerReportsSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <StatsGridSkeleton count={4} tall />
      <div className="grid gap-5 xl:grid-cols-2">
        <PanelSkeleton>
          <Skeleton className="h-5 w-44" />
          <Skeleton className="mt-5 h-72 w-full rounded-3xl" />
        </PanelSkeleton>
        <PanelSkeleton>
          <Skeleton className="h-5 w-44" />
          <div className="mt-5 space-y-3">
            {range(6).map((item) => (
              <Skeleton key={item} className="h-12 w-full rounded-2xl" />
            ))}
          </div>
        </PanelSkeleton>
      </div>
    </div>
  );
}

function ManagerSettingsSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
        <PanelSkeleton>
          <div className="space-y-3">
            {range(6).map((item) => (
              <Skeleton key={item} className="h-11 w-full rounded-2xl" />
            ))}
          </div>
        </PanelSkeleton>
        <PanelSkeleton>
          <Skeleton className="h-5 w-44" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {range(8).map((item) => (
              <Skeleton key={item} className="h-12 w-full" />
            ))}
          </div>
        </PanelSkeleton>
      </div>
    </div>
  );
}

function ManagerNotificationsSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {range(5).map((item) => (
          <StatCardSkeleton key={item} />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
        <PanelSkeleton>
          <Skeleton className="h-5 w-36" />
          <div className="mt-5 space-y-3">
            {range(5).map((item) => (
              <Skeleton key={item} className="h-12 w-full rounded-2xl" />
            ))}
          </div>
        </PanelSkeleton>
        <div className="space-y-3">
          {range(6).map((item) => (
            <PanelSkeleton key={item} className="p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
                <Skeleton className="h-8 w-20 rounded-full" />
              </div>
            </PanelSkeleton>
          ))}
        </div>
      </div>
    </div>
  );
}

function ManagerMoreSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action={false} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {range(9).map((item) => (
          <PanelSkeleton key={item} className="p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-2xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </PanelSkeleton>
        ))}
      </div>
    </div>
  );
}

function MobileSectionShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function EmployeeHomeSkeleton() {
  return (
    <div className="space-y-5 p-4">
      <div className="grid grid-cols-2 gap-3">
        <MobileSectionShell>
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-3 h-8 w-16" />
          <Skeleton className="mt-4 h-2 w-full rounded-full" />
        </MobileSectionShell>
        <MobileSectionShell>
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-3 h-8 w-12" />
          <Skeleton className="mt-4 h-2 w-full rounded-full" />
        </MobileSectionShell>
      </div>
      <MobileSectionShell>
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-9 w-16 rounded-full" />
        </div>
        <Skeleton className="mt-4 h-2 w-full rounded-full" />
        <div className="mt-5 space-y-3">
          {range(4).map((item) => (
            <Skeleton key={item} className="h-20 w-full rounded-3xl" />
          ))}
        </div>
      </MobileSectionShell>
      <Skeleton className="h-6 w-40" />
      <MobileSectionShell>
        <Skeleton className="h-20 w-full rounded-3xl" />
      </MobileSectionShell>
    </div>
  );
}

function EmployeeTasksSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-32" />
      <div className="flex gap-2 overflow-hidden">
        {range(4).map((item) => (
          <Skeleton key={item} className="h-10 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      {range(6).map((item) => (
        <MobileSectionShell key={item}>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-3">
              <Skeleton className="h-5 w-52 max-w-full" />
              <Skeleton className="h-3 w-44" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-5 h-12 w-full rounded-2xl" />
        </MobileSectionShell>
      ))}
    </div>
  );
}

function EmployeeTaskDetailSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-6 w-20" />
      <MobileSectionShell>
        <Skeleton className="h-6 w-56 max-w-full" />
        <Skeleton className="mt-3 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-4/5" />
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      </MobileSectionShell>
      <MobileSectionShell>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="mt-4 h-32 w-full rounded-3xl" />
        <Skeleton className="mt-4 h-12 w-full rounded-2xl" />
      </MobileSectionShell>
    </div>
  );
}

function EmployeeCheckInSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <MobileSectionShell className="text-center">
        <Skeleton className="mx-auto h-20 w-20 rounded-full" />
        <Skeleton className="mx-auto mt-5 h-8 w-32" />
        <Skeleton className="mx-auto mt-3 h-4 w-48" />
        <Skeleton className="mt-8 h-14 w-full rounded-2xl" />
      </MobileSectionShell>
      <div className="grid grid-cols-2 gap-3">
        <MobileSectionShell>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-16" />
        </MobileSectionShell>
        <MobileSectionShell>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-16" />
        </MobileSectionShell>
      </div>
    </div>
  );
}

function EmployeeHistorySkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-36" />
      <div className="grid grid-cols-3 gap-2">
        {range(3).map((item) => (
          <Skeleton key={item} className="h-24 rounded-3xl" />
        ))}
      </div>
      {range(7).map((item) => (
        <MobileSectionShell key={item}>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-8 w-16 rounded-full" />
          </div>
        </MobileSectionShell>
      ))}
    </div>
  );
}

function EmployeeRequestsSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-32" />
      <MobileSectionShell>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-4 h-12 w-full" />
        <Skeleton className="mt-3 h-28 w-full" />
        <Skeleton className="mt-4 h-12 w-full rounded-2xl" />
      </MobileSectionShell>
      {range(3).map((item) => (
        <MobileSectionShell key={item}>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-3 h-3 w-32" />
        </MobileSectionShell>
      ))}
    </div>
  );
}

function EmployeeScheduleSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-36" />
      {range(6).map((item) => (
        <MobileSectionShell key={item}>
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
        </MobileSectionShell>
      ))}
    </div>
  );
}

function EmployeeProfileSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <MobileSectionShell className="text-center">
        <Skeleton className="mx-auto h-24 w-24 rounded-full" />
        <Skeleton className="mx-auto mt-5 h-5 w-48" />
        <Skeleton className="mx-auto mt-3 h-3 w-32" />
        <Skeleton className="mx-auto mt-6 h-11 w-40 rounded-2xl" />
      </MobileSectionShell>
      <MobileSectionShell>
        <Skeleton className="h-5 w-36" />
        <div className="mt-5 grid grid-cols-2 gap-3">
          {range(4).map((item) => (
            <Skeleton key={item} className="h-20 rounded-2xl" />
          ))}
        </div>
      </MobileSectionShell>
      <MobileSectionShell>
        <Skeleton className="h-5 w-44" />
        <Skeleton className="mt-4 h-16 w-full rounded-2xl" />
      </MobileSectionShell>
    </div>
  );
}

function EmployeeSettingsSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-32" />
      {range(7).map((item) => (
        <MobileSectionShell key={item}>
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-6 rounded-full" />
          </div>
        </MobileSectionShell>
      ))}
    </div>
  );
}

function EmployeeNotificationsSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-36" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-3xl" />
        <Skeleton className="h-24 rounded-3xl" />
      </div>
      {range(7).map((item) => (
        <MobileSectionShell key={item}>
          <div className="flex items-start gap-3">
            <Skeleton className="h-11 w-11 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </MobileSectionShell>
      ))}
    </div>
  );
}
