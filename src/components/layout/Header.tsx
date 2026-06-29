'use client';

import { useMemo } from 'react';
import { Bell, Menu, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useTaskStore } from '@/store/taskStore';
import Link from 'next/link';
import Image from 'next/image';
import { ROLE_LABELS } from '@/lib/constants';
import { isEffectivelyReadNotification } from '@/lib/reviewHelpers';

interface HeaderProps {
  onMenuClick?: () => void;
  showMenu?: boolean;
}

export default function Header({ onMenuClick, showMenu = false }: HeaderProps) {
  const currentUser = useAuthStore((state) => state.currentUser);
  const notifications = useNotificationStore((state) => state.notifications);
  const submissions = useTaskStore((state) => state.submissions);
  const currentUserId = currentUser?.id;

  const unreadCount = useMemo(() => {
    if (!currentUserId) {
      return 0;
    }

    return notifications.filter((notification) => {
      return notification.user_id === currentUserId && !isEffectivelyReadNotification(notification, submissions);
    }).length;
  }, [currentUserId, notifications, submissions]);

  if (!currentUser) return null;

  const homeHref = currentUser.role === 'employee' ? '/employee' : '/manager';
  const notificationsHref = currentUser.role === 'employee' ? '/employee/notifications' : '/manager/notifications';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur safe-top no-print">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {showMenu && (
            <button
              type="button"
              onClick={onMenuClick}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          
          {/* PS Logo Branding */}
          <Link href={homeHref} className="mr-1 flex min-w-0 items-center gap-2">
            <Image src="/icons/PS.png" alt="PS Rice" width={32} height={32} loading="eager" className="w-8 h-8 rounded-lg object-cover shadow-sm" />
            <span className="hidden truncate font-black tracking-tight text-slate-800 sm:block">PS Rice Wholesale</span>
          </Link>
          
          <div className="hidden md:block border-l border-slate-200 h-6 mx-2"></div>

          <div className="hidden min-w-0 sm:block">
            <h2 className="truncate text-sm font-semibold text-slate-900 leading-tight">
              {currentUser.full_name}
            </h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              {ROLE_LABELS[currentUser.role]}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link 
            href={notificationsHref} 
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={async () => {
              const { logout } = useAuthStore.getState();
              await logout();
              window.location.href = '/login';
            }}
            className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-0 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 md:px-3"
            aria-label="Logout"
            title="ออกจากระบบ"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-xs font-bold hidden md:block">ออก</span>
          </button>
        </div>
      </div>
    </header>
  );
}
