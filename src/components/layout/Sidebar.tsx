'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  LayoutDashboard, Clock, ClipboardList, Users, CheckSquare,
  Building2, FileText, CalendarCheck, BarChart3, Settings, X, LogOut,
  CalendarDays, WalletCards, ReceiptText,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import { useEmployeeStore } from '@/store/employeeStore';
import { useTaskStore } from '@/store/taskStore';
import { getPendingReviewCountForUser } from '@/lib/reviewHelpers';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Clock, ClipboardList, Users, CheckSquare,
  Building2, FileText, CalendarCheck, BarChart3, Settings,
  CalendarDays, WalletCards, ReceiptText,
};

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface SidebarProps {
  items: NavItem[];
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ items, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, logout } = useAuthStore();
  const users = useEmployeeStore((state) => state.users);
  const submissions = useTaskStore((state) => state.submissions);
  const pendingReviewCount = getPendingReviewCountForUser(submissions, currentUser, users);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 bottom-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white
          transform transition-transform duration-200 ease-out
          lg:translate-x-0 lg:static lg:z-auto
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden border border-slate-200 shrink-0">
              <Image src="/icons/PS.png" alt="PS Rice Logo" width={40} height={40} loading="eager" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-slate-900">PS Rice Wholesale</h1>
              <p className="text-[10px] text-slate-500">ระบบจัดการงาน</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 lg:hidden"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          <div className="space-y-0.5">
            {items.map(item => {
              const Icon = iconMap[item.icon] || LayoutDashboard;
              const isActive = pathname === item.href ||
                (item.href !== '/manager' && pathname.startsWith(item.href));
              const isReviewItem = item.href === '/manager/review';

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`
                    flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium touch-manipulation
                    transition-colors duration-150
                    ${isActive
                      ? 'bg-primary-50 text-primary-800 ring-1 ring-primary-100'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }
                  `}
                >
                  <span className="relative flex-shrink-0">
                    <Icon className="w-[18px] h-[18px]" />
                    {isReviewItem && pendingReviewCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                    )}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {isReviewItem && pendingReviewCount > 0 && (
                    <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      {pendingReviewCount > 99 ? '99+' : pendingReviewCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-slate-100 flex flex-col gap-3">
          <button 
            type="button"
            onClick={handleLogout}
            className="flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition-colors duration-150 hover:bg-red-50"
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            ออกจากระบบ
          </button>
          <p className="text-[10px] text-slate-400 font-medium text-center">PS Rice v1.0</p>
        </div>
      </aside>
    </>
  );
}
