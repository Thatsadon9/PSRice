'use client';

import { useMemo } from 'react';
import { Bell, Menu, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import Link from 'next/link';
import Image from 'next/image';
import { ROLE_LABELS } from '@/lib/constants';

interface HeaderProps {
  onMenuClick?: () => void;
  showMenu?: boolean;
}

export default function Header({ onMenuClick, showMenu = false }: HeaderProps) {
  const currentUser = useAuthStore((state) => state.currentUser);
  const notifications = useNotificationStore((state) => state.notifications);
  const currentUserId = currentUser?.id;

  const unreadCount = useMemo(() => {
    if (!currentUserId) {
      return 0;
    }

    return notifications.filter((notification) => {
      return notification.user_id === currentUserId && !notification.is_read;
    }).length;
  }, [currentUserId, notifications]);

  if (!currentUser) return null;

  const homeHref = currentUser.role === 'employee' ? '/employee' : '/manager';
  const notificationsHref = currentUser.role === 'employee' ? '/employee/notifications' : '/manager/notifications';

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200 safe-top no-print">
      <div className="flex items-center justify-between px-4 py-3 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          {showMenu && (
            <button
              onClick={onMenuClick}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          
          {/* PS Logo Branding */}
          <Link href={homeHref} className="flex items-center gap-2 mr-1">
            <Image src="/icons/PS.png" alt="PS Rice" width={32} height={32} loading="eager" className="w-8 h-8 rounded-lg object-cover shadow-sm" />
            <span className="font-black tracking-tight text-slate-800 hidden sm:block">PS Rice Wholesale</span>
          </Link>
          
          <div className="hidden md:block border-l border-slate-200 h-6 mx-2"></div>

          <div className="hidden sm:block">
            <h2 className="text-sm font-semibold text-slate-900 leading-tight">
              {currentUser.full_name}
            </h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              {ROLE_LABELS[currentUser.role]}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link 
            href={notificationsHref} 
            className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>

          <button
            onClick={async () => {
              const { logout } = useAuthStore.getState();
              await logout();
              window.location.href = '/login';
            }}
            className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all flex items-center gap-2"
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
