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
      <div className="flex items-stretch max-w-lg mx-auto">
        {items.map(item => {
          const Icon = iconMap[item.icon] || LayoutDashboard;
          const isActive = pathname === item.href ||
            (item.href !== '/employee' && item.href !== '/manager' && pathname.startsWith(item.href));
          const isReviewItem = item.href === '/manager/review';

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex-1 flex flex-col items-center gap-0.5 py-2 pt-2.5
                transition-colors duration-150 relative
                ${isActive
                  ? 'text-primary-800 nav-active'
                  : 'text-slate-400 hover:text-slate-600'
                }
              `}
            >
              <span className="relative">
                <Icon className="w-5 h-5" />
                {isReviewItem && pendingReviewCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                    {pendingReviewCount > 9 ? '9+' : pendingReviewCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
