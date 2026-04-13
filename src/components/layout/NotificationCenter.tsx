'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock,
  MailOpen,
  MapPin,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
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
    <div className="space-y-6 animate-fade-in px-4 py-8 pb-24 max-w-lg mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={backHref} className="p-2.5 bg-white rounded-2xl shadow-sm border border-slate-100 hover:bg-slate-50 transition-all active:scale-95">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div className="space-y-0.5">
             <h1 className="text-xl font-black text-slate-900 leading-none">{title}</h1>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">Inbox & Alerts</p>
          </div>
        </div>

        {unreadCount > 0 && (
          <Button variant="none" size="sm" onClick={handleMarkAllRead} className="bg-primary-50 text-primary-700 font-black text-[10px] uppercase tracking-widest hover:bg-primary-100 px-4">
            Mark all read
          </Button>
        )}
      </div>

      {unreadCount > 0 && (
        <div className="px-1">
          <Badge variant="info" className="font-black text-[10px] px-3 py-1">
            You have {unreadCount} unread message{unreadCount > 1 ? 's' : ''}
          </Badge>
        </div>
      )}

      {reviewSummary && reviewSummary.count > 0 && (
        <Link href={reviewSummary.href} className="block group">
          <Card className="border-red-100 bg-red-50/70 hover:border-red-200 transition-all hover:shadow-lg hover:shadow-red-900/5 rounded-[2rem] p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-red-100 text-red-600 rounded-2xl group-hover:scale-110 transition-transform">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-black text-red-900">{reviewSummary.title}</p>
                  <p className="text-[10px] font-black text-red-700/60 uppercase tracking-widest mt-1">{reviewSummary.description}</p>
                </div>
              </div>
              <span className="inline-flex min-w-9 h-9 items-center justify-center rounded-2xl bg-red-600 text-xs font-black text-white shadow-lg shadow-red-200">
                {reviewSummary.count}
              </span>
            </div>
          </Card>
        </Link>
      )}

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="relative">
            <div className="w-24 h-24 bg-slate-100 rounded-[2.5rem] flex items-center justify-center shadow-inner">
              <Bell className="w-10 h-10 text-slate-300" />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
          </div>
          <div>
            <p className="text-lg font-black text-slate-900">All caught up!</p>
            <p className="text-xs text-slate-400 font-bold mt-1">Your inbox is clear. We&apos;ll notify you <br />when something new arrives.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="px-1 flex items-center justify-between">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Recent Activity</h2>
          </div>
          <div className="space-y-3">
            {notifications.slice(0, 20).map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => void handleNotificationClick(notification)}
                className={`
                  w-full p-4 rounded-[2rem] border text-left transition-all cursor-pointer relative overflow-hidden group
                  ${notification.is_read
                    ? 'bg-white border-slate-100 hover:border-slate-200'
                    : 'bg-white border-primary-200 shadow-xl shadow-primary-900/5 ring-1 ring-primary-50'
                  }
                  hover:scale-[1.01] active:scale-[0.99]
                `}
              >
                {!notification.is_read && (
                  <div className="absolute top-0 right-0 w-12 h-12 bg-primary-600/5 rounded-bl-[2rem]" />
                )}

                <div className="flex gap-4">
                  <div
                    className={`
                      w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110
                      ${notification.is_read ? 'bg-slate-50 text-slate-400' : 'bg-primary-50 text-primary-600'}
                    `}
                  >
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0 py-1">
                    <div className="flex items-center justify-between gap-2">
                       <h3 className={`text-sm font-black truncate ${notification.is_read ? 'text-slate-700' : 'text-slate-900'}`}>
                         {notification.title}
                       </h3>
                       {!notification.is_read && <div className="w-2 h-2 bg-primary-600 rounded-full shrink-0 animate-pulse" />}
                    </div>
                    <p className={`text-xs mt-1 leading-relaxed line-clamp-2 ${notification.is_read ? 'text-slate-400 font-medium' : 'text-slate-600 font-bold'}`}>
                      {notification.message}
                    </p>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-black uppercase tracking-wider">
                        <Clock className="w-3.5 h-3.5" />
                        {formatRelativeTime(notification.created_at)}
                      </div>
                      {notification.link && (
                        <span className="text-[10px] font-black text-primary-600 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                          View Details
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          
          {notifications.length > 5 && (
            <p className="text-center text-[10px] font-black text-slate-300 uppercase tracking-widest pt-4">End of notifications</p>
          )}
        </div>
      )}
    </div>
  );
}
