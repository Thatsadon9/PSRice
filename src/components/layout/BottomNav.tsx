'use client';

import { LayoutGroup, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Clock, ClipboardList, History, UserCircle,
  Users, CheckSquare, Menu, Building2, CalendarDays, Trophy, WalletCards, ReceiptText
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useTaskStore } from '@/store/taskStore';
import { getPendingReviewCountForUser } from '@/lib/reviewHelpers';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Clock, ClipboardList, History, UserCircle,
  Users, CheckSquare, Menu, Building2, CalendarDays, Trophy, WalletCards, ReceiptText,
};

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface BottomNavProps {
  items: NavItem[];
}

const morphTransition = { type: 'spring' as const, stiffness: 300, damping: 25, mass: 0.8 };

export default function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname();
  const { currentUser } = useAuthStore();
  const users = useEmployeeStore((state) => state.users);
  const submissions = useTaskStore((state) => state.submissions);
  const pendingReviewCount = getPendingReviewCountForUser(submissions, currentUser, users);

  return (
    <nav className="fixed inset-x-0 bottom-3 z-40 px-4 safe-bottom no-print">
      <LayoutGroup id="employee-bottom-nav">
        <div className="relative mx-auto h-[88px] max-w-[390px]">
          <div className="absolute inset-x-0 bottom-0 h-[68px] rounded-[2rem] border border-white/80 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur-xl" />

          <div className="relative z-10 grid h-full grid-cols-5 items-end">
            {items.map(item => {
              const Icon = iconMap[item.icon] || LayoutDashboard;
              const isActive = pathname === item.href ||
                (item.href !== '/employee' && item.href !== '/manager' && pathname.startsWith(item.href));
              const isTaskItem = item.href === '/employee/tasks';
              const isReviewItem = item.href === '/manager/review';

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`
                    group relative flex h-full min-w-0 flex-col items-center justify-end pb-3 text-center touch-manipulation
                    ${isTaskItem
                      ? 'text-primary-800'
                      : 'text-slate-400 transition-colors duration-200 hover:text-primary-700'
                    }
                  `}
                >
                  {isTaskItem ? (
                    <span
                      className={`
                        relative flex min-w-[56px] max-w-full flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2
                        text-primary-800
                      `}
                    >
                      <span className="absolute -top-10 flex h-[62px] w-[62px] items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-[0_12px_28px_rgba(5,150,105,0.35)] ring-[6px] ring-white transition-transform duration-300 group-hover:-translate-y-1 group-active:scale-95">
                        {isActive && (
                          <motion.span
                            layoutId="employee-nav-active"
                            className="absolute inset-0 rounded-full bg-gradient-to-br from-primary-400 to-primary-600"
                            transition={morphTransition}
                          />
                        )}
                        <span className="absolute inset-1 rounded-full bg-white/10" />
                        <Icon className="relative z-10 h-7 w-7 shrink-0 drop-shadow-sm" />
                      </span>
                      {/* Invisible placeholder to align text height with other items */}
                      <div className="h-5 w-5 shrink-0 opacity-0" />
                      <span className="relative z-10 max-w-full truncate text-[10px] font-black leading-tight">
                        {item.label}
                      </span>
                    </span>
                  ) : (
                    <span
                      className={`
                        relative flex min-w-[56px] max-w-full flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2
                        ${isActive ? 'text-primary-800' : ''}
                      `}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="employee-nav-active"
                          className="absolute inset-0 rounded-2xl border border-primary-100 bg-primary-50 shadow-sm"
                          transition={morphTransition}
                        />
                      )}
                      <span className="relative z-10">
                        <Icon className="h-5 w-5 shrink-0" />
                        {isReviewItem && pendingReviewCount > 0 && (
                          <span className="absolute -top-1.5 -right-2.5 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white shadow-sm ring-2 ring-white">
                            {pendingReviewCount > 9 ? '9+' : pendingReviewCount}
                          </span>
                        )}
                      </span>
                      <span className="relative z-10 max-w-full truncate text-[10px] font-bold leading-tight">
                        {item.label}
                      </span>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </LayoutGroup>
    </nav>
  );
}
