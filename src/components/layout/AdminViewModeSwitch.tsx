'use client';

import { ShieldCheck, ToggleLeft, ToggleRight, UserCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import { useAuthStore } from '@/store/authStore';
import type { AdminViewMode } from '@/lib/viewMode';

interface AdminViewModeSwitchProps {
  variant?: 'header' | 'card';
}

function getModeCopy(mode: AdminViewMode) {
  if (mode === 'employee') {
    return {
      label: 'มุมมองพนักงาน',
      description: 'กำลังใช้งานระบบเหมือนพนักงาน',
      action: 'กลับโหมดจัดการ',
      icon: UserCircle,
      nextMode: 'manager' as const,
      nextPath: '/manager',
    };
  }

  return {
    label: 'มุมมองจัดการ',
    description: 'กำลังใช้งานสิทธิ์ผู้ดูแลระบบ',
    action: 'ไปมุมมองพนักงาน',
    icon: ShieldCheck,
    nextMode: 'employee' as const,
    nextPath: '/employee',
  };
}

export default function AdminViewModeSwitch({ variant = 'header' }: AdminViewModeSwitchProps) {
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.currentUser);
  const adminViewMode = useAuthStore((state) => state.adminViewMode);
  const setAdminViewMode = useAuthStore((state) => state.setAdminViewMode);

  if (currentUser?.role !== 'admin') {
    return null;
  }

  const copy = getModeCopy(adminViewMode);
  const ModeIcon = copy.icon;
  const ToggleIcon = adminViewMode === 'employee' ? ToggleRight : ToggleLeft;

  const handleSwitch = () => {
    setAdminViewMode(copy.nextMode);
    router.push(copy.nextPath);
  };

  if (variant === 'card') {
    return (
      <Card className="border-primary-100 bg-primary-50/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-primary-700 shadow-sm">
              <ModeIcon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">สลับโหมดการใช้งาน</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{copy.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSwitch}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-primary-800 shadow-sm ring-1 ring-primary-100 transition-colors hover:bg-primary-100"
            aria-label={copy.action}
          >
            <ToggleIcon className="h-5 w-5" aria-hidden />
            <span>{copy.action}</span>
          </button>
        </div>
      </Card>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSwitch}
      className="hidden h-11 items-center gap-2 rounded-xl border border-primary-100 bg-primary-50 px-3 text-xs font-bold text-primary-800 transition-colors hover:bg-primary-100 lg:inline-flex"
      aria-label={copy.action}
      title={copy.action}
    >
      <ModeIcon className="h-4 w-4" aria-hidden />
      <span>{copy.label}</span>
      <ToggleIcon className="h-5 w-5" aria-hidden />
    </button>
  );
}
