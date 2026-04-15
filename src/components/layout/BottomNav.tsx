'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Clock, ClipboardList, History, UserCircle,
  Users, CheckSquare, Menu, Building2
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useTaskStore } from '@/store/taskStore';
import { getPendingReviewCountForUser } from '@/lib/reviewHelpers';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Clock, ClipboardList, History, UserCircle,
  Users, CheckSquare, Menu, Building2,
};

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface BottomNavProps {
  items: NavItem[];
}

export default function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname();
  const { currentUser } = useAuthStore();
  const users = useEmployeeStore((state) => state.users);
  const submissions = useTaskStore((state) => state.submissions);
  const pendingReviewCount = getPendingReviewCountForUser(submissions, currentUser, users);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 safe-bottom no-print">
      <div className="mx-auto flex max-w-lg items-stretch">
        {items.map(item => {
          const Icon = iconMap[item.icon] || LayoutDashboard;
          const isActive = pathname === item.href ||
            (item.href !== '/employee' && item.href !== '/manager' && pathname.startsWith(item.href));
          const isReviewItem = item.href === '/manager/review';

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`
                relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 px-2 py-2.5
                transition-colors duration-150 touch-manipulation
                ${isActive
                  ? 'text-primary-800 nav-active'
                  : 'text-slate-400 hover:text-slate-600'
                }
              `}
            >
              <span className="relative">
                <Icon className="h-5 w-5 shrink-0" />
                {isReviewItem && pendingReviewCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                    {pendingReviewCount > 9 ? '9+' : pendingReviewCount}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate px-1 text-[10px] font-medium leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
