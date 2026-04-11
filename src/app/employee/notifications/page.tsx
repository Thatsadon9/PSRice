'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { 
  Bell, CheckCircle2, Clock, ArrowLeft, 
  ClipboardList, Calendar, MapPin, AlertTriangle,
  MailOpen
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/dateUtils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function NotificationsPage() {
  const { currentUser } = useAuthStore();
  const notificationStore = useNotificationStore();
  const router = useRouter();

  useEffect(() => {
    if (currentUser?.id) {
       notificationStore.fetchNotifications(currentUser.id);
    }
  }, [currentUser?.id, notificationStore.fetchNotifications]);

  const notifications = currentUser ? notificationStore.getNotificationsByUser(currentUser.id) : [];
  const unreadCount = currentUser ? notificationStore.getUnreadCount(currentUser.id) : 0;

  const handleMarkAllRead = async () => {
    if (currentUser?.id) {
       await notificationStore.markAllAsRead(currentUser.id);
    }
  };

  const handleNotificationClick = async (notif: any) => {
    if (!notif.is_read) {
       await notificationStore.markAsRead(notif.id);
    }
    if (notif.link) {
       router.push(notif.link);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'task': return <ClipboardList className="w-5 h-5 text-blue-500" />;
      case 'attendance': return <MapPin className="w-5 h-5 text-emerald-500" />;
      case 'review': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      default: return <Bell className="w-5 h-5 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-4 animate-fade-in px-4 py-6 pb-24">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href="/employee" className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold text-slate-900">การแจ้งเตือน</h1>
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={handleMarkAllRead} icon={<MailOpen className="w-4 h-4" />}>
            อ่านทั้งหมด
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <Bell className="w-8 h-8 text-slate-300" />
          </div>
          <p className="text-slate-500 font-medium">ไม่มีการแจ้งเตือนใหม่ในขณะนี้</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => (
            <div 
              key={notif.id}
              onClick={() => handleNotificationClick(notif)}
              className={`
                p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden
                ${notif.is_read 
                  ? 'bg-white border-slate-100 opacity-75' 
                  : 'bg-white border-primary-100 shadow-sm shadow-primary-50 ring-1 ring-primary-50'
                }
                hover:border-primary-200 hover:shadow-md transition-all
              `}
            >
              {!notif.is_read && (
                <div className="absolute top-0 right-0 w-8 h-8">
                  <div className="absolute top-2 right-2 w-2.5 h-2.5 bg-primary-600 rounded-full shadow-lg shadow-primary-200"></div>
                </div>
              )}
              
              <div className="flex gap-4">
                <div className={`
                  w-12 h-12 rounded-xl flex items-center justify-center shrink-0
                  ${notif.is_read ? 'bg-slate-50' : 'bg-primary-50'}
                `}>
                  {getIcon(notif.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className={`text-sm font-bold truncate ${notif.is_read ? 'text-slate-700' : 'text-slate-900'}`}>
                      {notif.title}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed mb-2">
                    {notif.message}
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                    <Clock className="w-3 h-3" />
                    {formatRelativeTime(notif.created_at)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
