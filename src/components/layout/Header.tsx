'use client';

import { Bell, Menu } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import Link from 'next/link';
import { ROLE_LABELS } from '@/lib/constants';

interface HeaderProps {
  onMenuClick?: () => void;
  showMenu?: boolean;
}

export default function Header({ onMenuClick, showMenu = false }: HeaderProps) {
  const { currentUser } = useAuthStore();
  const unreadCount = useNotificationStore(s =>
    currentUser ? s.getUnreadCount(currentUser.id) : 0
  );

  if (!currentUser) return null;

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
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {currentUser.full_name}
            </h2>
            <p className="text-xs text-slate-500">
              {ROLE_LABELS[currentUser.role]}
            </p>
          </div>
        </div>

        <Link 
          href={currentUser.role === 'employee' ? '/employee/notifications' : '/manager/notifications'} 
          className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
