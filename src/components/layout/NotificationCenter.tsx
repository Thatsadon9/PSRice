'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  ClipboardList,
  Clock,
  MailOpen,
  MapPin,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatRelativeTime } from '@/lib/dateUtils';
import type { Notification } from '@/lib/types';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';

interface NotificationCenterProps {
  backHref: string;
  title?: string;
  reviewSummary?: {
    count: number;
    href: string;
    title: string;
    description: string;
  };
}

function getNotificationIcon(type: Notification['type']) {
  switch (type) {
    case 'task':
      return <ClipboardList className="w-5 h-5 text-blue-500" />;
    case 'attendance':
      return <MapPin className="w-5 h-5 text-emerald-500" />;
    case 'review':
      return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    default:
      return <Bell className="w-5 h-5 text-slate-500" />;
  }
}

export default function NotificationCenter({
  backHref,
  title = 'การแจ้งเตือน',
  reviewSummary,
}: NotificationCenterProps) {
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.currentUser);
  const fetchNotifications = useNotificationStore((state) => state.fetchNotifications);
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
  const markAsRead = useNotificationStore((state) => state.markAsRead);
  const allNotifications = useNotificationStore((state) => state.notifications);

  const currentUserId = currentUser?.id;

  const notifications = useMemo(() => {
    if (!currentUserId) {
      return [];
    }

    return allNotifications.filter((notification) => notification.user_id === currentUserId);
  }, [allNotifications, currentUserId]);

  const unreadCount = useMemo(() => {
    return notifications.filter((notification) => !notification.is_read).length;
  }, [notifications]);

  useEffect(() => {
    if (currentUserId) {
      void fetchNotifications(currentUserId);
    }
  }, [currentUserId, fetchNotifications]);

  const handleMarkAllRead = async () => {
    if (currentUser?.id) {
      await markAllAsRead(currentUser.id);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }

    if (notification.link) {
      router.push(notification.link);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in px-4 py-6 pb-24">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={backHref} className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        </div>

        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={handleMarkAllRead} icon={<MailOpen className="w-4 h-4" />}>
            อ่านทั้งหมด
          </Button>
        )}
      </div>

      {reviewSummary && reviewSummary.count > 0 && (
        <Link href={reviewSummary.href} className="block">
          <Card className="border-red-100 bg-red-50/70 hover:border-red-200 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-red-900">{reviewSummary.title}</p>
                <p className="text-xs text-red-700 mt-1">{reviewSummary.description}</p>
              </div>
              <span className="inline-flex min-w-9 items-center justify-center rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white">
                {reviewSummary.count}
              </span>
            </div>
          </Card>
        </Link>
      )}

      {notifications.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <Bell className="w-8 h-8 text-slate-300" />
          </div>
          <p className="text-slate-500 font-medium">ไม่มีการแจ้งเตือนใหม่ในขณะนี้</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => void handleNotificationClick(notification)}
              className={`
                w-full p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden
                ${notification.is_read
                  ? 'bg-white border-slate-100 opacity-75'
                  : 'bg-white border-primary-100 shadow-sm shadow-primary-50 ring-1 ring-primary-50'
                }
                hover:border-primary-200 hover:shadow-md
              `}
            >
              {!notification.is_read && (
                <div className="absolute top-0 right-0 w-8 h-8">
                  <div className="absolute top-2 right-2 w-2.5 h-2.5 bg-primary-600 rounded-full shadow-lg shadow-primary-200"></div>
                </div>
              )}

              <div className="flex gap-4">
                <div
                  className={`
                    w-12 h-12 rounded-xl flex items-center justify-center shrink-0
                    ${notification.is_read ? 'bg-slate-50' : 'bg-primary-50'}
                  `}
                >
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-sm font-bold truncate ${notification.is_read ? 'text-slate-700' : 'text-slate-900'}`}>
                    {notification.title}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed mt-1 mb-2">
                    {notification.message}
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                    <Clock className="w-3 h-3" />
                    {formatRelativeTime(notification.created_at)}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
