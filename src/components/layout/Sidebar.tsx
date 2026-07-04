'use client';

import { LayoutGroup, motion, useMotionValue, useTransform } from 'framer-motion';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  LayoutDashboard, Clock, ClipboardList, Users, CheckSquare,
  Building2, FileText, CalendarCheck, BarChart3, Settings, X, LogOut,
  CalendarDays, WalletCards, ReceiptText, Menu, Trophy, UserCircle,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import { useEmployeeStore } from '@/store/employeeStore';
import { useTaskStore } from '@/store/taskStore';
import { getPendingReviewCountForUser } from '@/lib/reviewHelpers';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Clock, ClipboardList, Users, CheckSquare,
  Building2, FileText, CalendarCheck, BarChart3, Settings,
  CalendarDays, WalletCards, ReceiptText, Menu, Trophy, UserCircle,
};

const sidebarMorphTransition = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 34,
  mass: 0.72,
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
  onOpen?: () => void;
}

export default function Sidebar({ items, isOpen, onClose, onOpen }: SidebarProps) {
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

  const x = useMotionValue(isOpen ? 0 : -288);
  const bgOpacity = useTransform(x, [-288, 0], [0, 0.4]);

  return (
    <>
      {/* Mobile overlay */}
      <motion.div
        className="fixed inset-0 bg-black z-40 lg:hidden"
        style={{ 
          opacity: bgOpacity,
          pointerEvents: isOpen ? 'auto' : 'none'
        }}
        onClick={onClose}
      />

      {/* Sidebar */}
      <motion.aside
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -288, right: 0 }}
        dragElastic={0}
        onDragEnd={(e, info) => {
          if (isOpen) {
            if (info.offset.x < -30 || info.velocity.x < -300) {
              onClose();
            }
          } else {
            if (info.offset.x > 30 || info.velocity.x > 300) {
              onOpen?.();
            }
          }
        }}
        initial={false}
        animate={{ x: isOpen ? 0 : -288 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
        className={`
          fixed top-0 left-0 bottom-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white
          lg:static lg:!transform-none lg:z-auto touch-pan-y
        `}
      >
        {/* Invisible edge drag handle to pull out the sidebar */}
        <div className="absolute top-0 -right-4 bottom-0 w-4 bg-transparent lg:hidden touch-pan-y" />
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
          <LayoutGroup id="manager-sidebar-nav">
            <div className="space-y-1">
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
                    aria-current={isActive ? 'page' : undefined}
                    className={`
                      group relative flex min-h-11 items-center gap-3 overflow-hidden rounded-2xl px-3 py-2 text-sm font-medium touch-manipulation
                      transition-colors duration-200
                      ${isActive ? 'text-primary-900' : 'text-slate-600 hover:text-slate-950'}
                    `}
                  >
                    {isActive && (
                      <>
                        <motion.span
                          layoutId="manager-sidebar-active-pill"
                          className="absolute inset-0 rounded-2xl border border-primary-100 bg-gradient-to-r from-primary-50 via-emerald-50 to-white shadow-[0_10px_26px_rgba(15,118,110,0.10)]"
                          transition={sidebarMorphTransition}
                        />
                        <motion.span
                          layoutId="manager-sidebar-active-rail"
                          className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-primary-500 shadow-[0_0_16px_rgba(16,185,129,0.45)]"
                          transition={sidebarMorphTransition}
                        />
                        <motion.span
                          layoutId="manager-sidebar-active-glow"
                          className="absolute right-3 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-primary-200/45 blur-xl"
                          transition={sidebarMorphTransition}
                        />
                      </>
                    )}

                    <motion.span
                      className={`
                        relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl
                        transition-colors duration-200
                        ${isActive
                          ? 'bg-white text-primary-700 shadow-sm ring-1 ring-primary-100'
                          : 'text-slate-500 group-hover:bg-slate-50 group-hover:text-slate-900'
                        }
                      `}
                      animate={{
                        scale: isActive ? 1.04 : 1,
                        y: isActive ? -1 : 0,
                      }}
                      transition={sidebarMorphTransition}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </motion.span>

                    {isReviewItem && pendingReviewCount > 0 && (
                      <span className="absolute left-[38px] top-2.5 z-20 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                    )}

                    <motion.span
                      className={`relative z-10 flex-1 truncate ${isReviewItem && pendingReviewCount > 0 ? 'pr-12' : ''}`}
                      animate={{
                        x: isActive ? 2 : 0,
                        fontWeight: isActive ? 800 : 500,
                      }}
                      transition={sidebarMorphTransition}
                    >
                      {item.label}
                    </motion.span>

                    {isReviewItem && pendingReviewCount > 0 && (
                      <span className="absolute right-3 top-1/2 z-20 inline-flex min-w-6 -translate-y-1/2 items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                        {pendingReviewCount > 99 ? '99+' : pendingReviewCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </LayoutGroup>
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
      </motion.aside>
    </>
  );
}
