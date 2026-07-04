'use client';

import { type MouseEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowLeft,
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Filter,
  Inbox,
  MapPin,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserCircle,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Select, { type SelectOption } from '@/components/ui/Select';
import { formatRelativeTime, formatThaiDate, getCurrentDateStr, isDateToday } from '@/lib/dateUtils';
import {
  getReviewRequestSubmissionId,
  isEffectivelyReadNotification,
  isResolvedReviewRequestNotification,
} from '@/lib/reviewHelpers';
import type { Branch, Notification, NotificationType, Task, TaskSubmission, User } from '@/lib/types';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useTaskStore } from '@/store/taskStore';

type InboxTab = 'action' | 'unread' | 'all' | 'archived';
type DateFilter = 'all' | 'today' | 'yesterday' | '7d' | '30d';
type NotificationGroupKey = 'today' | 'yesterday' | 'week' | 'older';

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

interface EnrichedNotification {
  notification: Notification;
  isRead: boolean;
  isArchived: boolean;
  isActionable: boolean;
  color: 'emerald' | 'amber' | 'blue' | 'red' | 'slate';
  icon: ReactNode;
  typeLabel: string;
  actionLabel: string;
  relatedUser?: User;
  relatedBranch?: Branch;
  task?: Task;
  groupKey: NotificationGroupKey;
}

const typeFilterOptions: SelectOption[] = [
  { value: 'all', label: 'ทุกประเภท' },
  { value: 'review', label: 'งานรอตรวจ', icon: <ClipboardCheck className="h-4 w-4" />, visualVariant: 'plain' },
  { value: 'task', label: 'งาน', icon: <ClipboardList className="h-4 w-4" />, visualVariant: 'plain' },
  { value: 'attendance', label: 'ลงเวลา', icon: <MapPin className="h-4 w-4" />, visualVariant: 'plain' },
  { value: 'system', label: 'ระบบ/คำขอ', icon: <Bell className="h-4 w-4" />, visualVariant: 'plain' },
];

const dateFilterOptions: SelectOption[] = [
  { value: 'all', label: 'ทุกช่วงเวลา' },
  { value: 'today', label: 'วันนี้' },
  { value: 'yesterday', label: 'เมื่อวาน' },
  { value: '7d', label: '7 วันล่าสุด' },
  { value: '30d', label: '30 วันล่าสุด' },
];

const groupLabels: Record<NotificationGroupKey, string> = {
  today: 'วันนี้',
  yesterday: 'เมื่อวาน',
  week: 'สัปดาห์นี้',
  older: 'เก่ากว่านั้น',
};

function getNotificationDate(notification: Notification) {
  const date = new Date(notification.created_at);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function getDaysAgo(date: Date) {
  const startOfToday = new Date(getCurrentDateStr());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((startOfToday.getTime() - startOfTarget.getTime()) / 86400000);
}

function getGroupKey(notification: Notification): NotificationGroupKey {
  const daysAgo = getDaysAgo(getNotificationDate(notification));

  if (daysAgo <= 0) return 'today';
  if (daysAgo === 1) return 'yesterday';
  if (daysAgo <= 7) return 'week';
  return 'older';
}

function getActionLabel(notification: Notification) {
  const link = notification.link || '';

  if (link.includes('/manager/review')) return 'ไปตรวจงาน';
  if (link.includes('/manager/requests') || link.includes('/employee/requests')) return 'ดูคำขอ';
  if (link.includes('/employee/tasks')) return 'เปิดงาน';
  if (link.includes('/attendance') || link.includes('/check-in')) return 'ดูเวลา';
  return 'ดูรายละเอียด';
}

function getTypePresentation(notification: Notification, actionable: boolean) {
  switch (notification.type) {
    case 'review':
      return actionable
        ? {
            icon: <ClipboardCheck className="h-5 w-5" />,
            color: 'amber' as const,
            typeLabel: 'รอตรวจ',
          }
        : {
            icon: <CheckCircle2 className="h-5 w-5" />,
            color: 'emerald' as const,
            typeLabel: 'ตรวจแล้ว',
          };
    case 'task':
      return {
        icon: <ClipboardList className="h-5 w-5" />,
        color: 'blue' as const,
        typeLabel: 'งาน',
      };
    case 'attendance':
      return {
        icon: <MapPin className="h-5 w-5" />,
        color: 'emerald' as const,
        typeLabel: 'ลงเวลา',
      };
    default:
      if (actionable) {
        return {
          icon: <AlertTriangle className="h-5 w-5" />,
          color: 'red' as const,
          typeLabel: 'ต้องจัดการ',
        };
      }

      return {
        icon: <Bell className="h-5 w-5" />,
        color: 'slate' as const,
        typeLabel: 'ระบบ',
      };
  }
}

function isSystemAction(notification: Notification) {
  const text = `${notification.title} ${notification.message}`.toLowerCase();
  return (
    notification.link?.includes('/manager/requests') ||
    text.includes('รออนุมัติ') ||
    text.includes('คำขอ') ||
    text.includes('สมัคร') ||
    text.includes('ล้มเหลว') ||
    text.includes('ไม่สำเร็จ')
  );
}

function isActionNotification(notification: Notification, submissions: TaskSubmission[]) {
  if (notification.status === 'done' || notification.status === 'archived' || notification.archived_at) {
    return false;
  }

  if (notification.category === 'action') {
    return !isEffectivelyReadNotification(notification, submissions);
  }

  if (notification.type === 'review') {
    return !isResolvedReviewRequestNotification(notification, submissions);
  }

  if (notification.type === 'system') {
    return isSystemAction(notification) && !notification.is_read;
  }

  return false;
}

function getTaskIdFromLink(link?: string | null) {
  if (!link) return null;

  try {
    const pathname = new URL(link, 'https://ps-rice.local').pathname;
    const parts = pathname.split('/').filter(Boolean);
    const taskIndex = parts.indexOf('tasks');
    return taskIndex >= 0 ? parts[taskIndex + 1] ?? null : null;
  } catch {
    const taskMatch = link.match(/\/tasks\/([^/?#]+)/);
    return taskMatch?.[1] ?? null;
  }
}

function getRelatedUserForNotification(
  notification: Notification,
  submissions: TaskSubmission[],
  tasks: Task[],
  users: User[],
) {
  if (notification.actor_user_id) {
    const actor = users.find((user) => user.id === notification.actor_user_id);
    if (actor) return actor;
  }

  const reviewSubmissionId = getReviewRequestSubmissionId(notification);
  if (reviewSubmissionId) {
    const submission = submissions.find((item) => item.id === reviewSubmissionId);
    const submitter = submission ? users.find((user) => user.id === submission.submitted_by) : undefined;
    if (submitter) return submitter;
  }

  const taskId = getTaskIdFromLink(notification.link);
  if (taskId) {
    const task = tasks.find((item) => item.id === taskId);
    const assignee = task ? users.find((user) => user.id === task.assigned_to) : undefined;
    if (assignee) return assignee;
  }

  return undefined;
}

function getRelatedTask(notification: Notification, submissions: TaskSubmission[], tasks: Task[]) {
  const reviewSubmissionId = getReviewRequestSubmissionId(notification);

  if (reviewSubmissionId) {
    const submission = submissions.find((item) => item.id === reviewSubmissionId);
    return submission ? tasks.find((task) => task.id === submission.task_id) : undefined;
  }

  const taskId = getTaskIdFromLink(notification.link);
  return taskId ? tasks.find((task) => task.id === taskId) : undefined;
}

function getActionSummaryText(count: number, role?: User['role']) {
  if (count === 0) {
    return role === 'employee'
      ? 'ยังไม่มีรายการที่ต้องตอบกลับตอนนี้'
      : 'ยังไม่มีรายการที่ต้องจัดการตอนนี้';
  }

  return role === 'employee'
    ? `มี ${count} รายการที่ควรเปิดดู`
    : `มี ${count} รายการที่ต้องจัดการ`;
}

function statToneClasses(color: EnrichedNotification['color'] | 'primary') {
  switch (color) {
    case 'red':
      return 'bg-red-50 text-red-700 ring-red-100';
    case 'amber':
      return 'bg-amber-50 text-amber-700 ring-amber-100';
    case 'blue':
      return 'bg-blue-50 text-blue-700 ring-blue-100';
    case 'emerald':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
    case 'primary':
      return 'bg-primary-50 text-primary-700 ring-primary-100';
    default:
      return 'bg-slate-50 text-slate-600 ring-slate-100';
  }
}

function rowToneClasses(color: EnrichedNotification['color'], isRead: boolean) {
  const tones = {
    red: {
      rail: 'bg-red-500',
      icon: 'bg-red-50 text-red-600 ring-red-100',
      unread: 'border-red-100 bg-red-50/50',
    },
    amber: {
      rail: 'bg-amber-500',
      icon: 'bg-amber-50 text-amber-600 ring-amber-100',
      unread: 'border-amber-100 bg-amber-50/50',
    },
    blue: {
      rail: 'bg-blue-500',
      icon: 'bg-blue-50 text-blue-600 ring-blue-100',
      unread: 'border-blue-100 bg-blue-50/50',
    },
    emerald: {
      rail: 'bg-emerald-500',
      icon: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
      unread: 'border-emerald-100 bg-emerald-50/50',
    },
    slate: {
      rail: 'bg-slate-300',
      icon: 'bg-slate-50 text-slate-500 ring-slate-100',
      unread: 'border-slate-200 bg-white',
    },
  }[color];

  return {
    rail: tones.rail,
    icon: tones.icon,
    container: isRead
      ? 'border-slate-200 bg-white hover:border-slate-300'
      : `${tones.unread} shadow-sm shadow-slate-900/5`,
  };
}

function compactCount(value: number) {
  return value > 99 ? '99+' : String(value);
}

export default function NotificationCenter({
  backHref,
  title = 'ศูนย์แจ้งเตือน',
  reviewSummary,
}: NotificationCenterProps) {
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.currentUser);
  const fetchNotifications = useNotificationStore((state) => state.fetchNotifications);
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
  const markAsRead = useNotificationStore((state) => state.markAsRead);
  const archiveNotification = useNotificationStore((state) => state.archiveNotification);
  const archiveReadNotifications = useNotificationStore((state) => state.archiveReadNotifications);
  const allNotifications = useNotificationStore((state) => state.notifications);
  const users = useEmployeeStore((state) => state.users);
  const branches = useBranchStore((state) => state.branches);
  const tasks = useTaskStore((state) => state.tasks);
  const submissions = useTaskStore((state) => state.submissions);

  const [activeTab, setActiveTab] = useState<InboxTab>('action');
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [typeFilter, setTypeFilter] = useState<NotificationType | 'all'>('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(30);

  const currentUserId = currentUser?.id;
  const isStaffView = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const branchOptions = useMemo<SelectOption[]>(() => [
    { value: 'all', label: 'ทุกสาขา' },
    ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
  ], [branches]);

  const employeeOptions = useMemo<SelectOption[]>(() => [
    { value: 'all', label: 'ทุกคน' },
    ...users
      .filter((user) => user.status !== 'inactive')
      .map((user) => ({
        value: user.id,
        label: user.full_name,
        description: branches.find((branch) => branch.id === user.branch_id)?.name,
        avatarUrl: user.avatar_url,
      })),
  ], [branches, users]);

  const notifications = useMemo(() => {
    if (!currentUserId) {
      return [];
    }

    return allNotifications
      .filter((notification) => notification.user_id === currentUserId)
      .sort((left, right) => getNotificationDate(right).getTime() - getNotificationDate(left).getTime());
  }, [allNotifications, currentUserId]);

  const enrichedNotifications = useMemo<EnrichedNotification[]>(() => {
    return notifications.map((notification) => {
      const isRead = isEffectivelyReadNotification(notification, submissions);
      const isArchived = notification.status === 'archived' || Boolean(notification.archived_at);
      const isActionable = isActionNotification(notification, submissions);
      const presentation = getTypePresentation(notification, isActionable);
      const relatedUser = getRelatedUserForNotification(notification, submissions, tasks, users);
      const task = getRelatedTask(notification, submissions, tasks);
      const branchId = notification.branch_id || relatedUser?.branch_id;
      const relatedBranch = branches.find((branch) => branch.id === branchId || branch.id === relatedUser?.branch_id);

      return {
        notification,
        isRead,
        isArchived,
        isActionable,
        icon: presentation.icon,
        color: presentation.color,
        typeLabel: presentation.typeLabel,
        actionLabel: getActionLabel(notification),
        relatedUser,
        relatedBranch,
        task,
        groupKey: getGroupKey(notification),
      };
    });
  }, [branches, notifications, submissions, tasks, users]);

  const stats = useMemo(() => {
    const activeItems = enrichedNotifications.filter((item) => !item.isArchived);
    const actionCount = activeItems.filter((item) => item.isActionable).length;
    const unreadCount = activeItems.filter((item) => !item.isRead).length;
    const reviewCount = activeItems.filter((item) => item.notification.type === 'review' && item.isActionable).length;
    const requestCount = activeItems.filter((item) => item.notification.link?.includes('/requests') && item.isActionable).length;
    const systemCount = activeItems.filter((item) => item.notification.type === 'system').length;
    const archivedCount = enrichedNotifications.filter((item) => item.isArchived).length;

    return {
      actionCount,
      unreadCount,
      reviewCount,
      requestCount,
      systemCount,
      archivedCount,
      totalCount: activeItems.length,
    };
  }, [enrichedNotifications]);

  const filteredNotifications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const now = new Date();

    return enrichedNotifications.filter((item) => {
      const { notification, relatedBranch, relatedUser, task } = item;
      const createdAt = getNotificationDate(notification);
      const daysAgo = Math.floor((now.getTime() - createdAt.getTime()) / 86400000);

      if (activeTab !== 'archived' && item.isArchived) return false;
      if (activeTab === 'archived' && !item.isArchived) return false;
      if (activeTab === 'action' && !item.isActionable) return false;
      if (activeTab === 'unread' && item.isRead) return false;

      if (typeFilter !== 'all' && notification.type !== typeFilter) return false;

      if (dateFilter === 'today' && !isDateToday(notification.created_at)) return false;
      if (dateFilter === 'yesterday' && getDaysAgo(createdAt) !== 1) return false;
      if (dateFilter === '7d' && daysAgo > 7) return false;
      if (dateFilter === '30d' && daysAgo > 30) return false;

      if (isStaffView && branchFilter !== 'all' && relatedBranch?.id !== branchFilter) return false;
      if (isStaffView && employeeFilter !== 'all' && relatedUser?.id !== employeeFilter) return false;

      if (!normalizedQuery) return true;

      const searchableText = [
        notification.title,
        notification.message,
        relatedUser?.full_name,
        relatedBranch?.name,
        task?.title,
      ].filter(Boolean).join(' ').toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [
    activeTab,
    branchFilter,
    dateFilter,
    employeeFilter,
    enrichedNotifications,
    isStaffView,
    query,
    typeFilter,
  ]);

  const visibleNotifications = filteredNotifications.slice(0, visibleLimit);

  const groupedNotifications = useMemo(() => {
    const groups: Record<NotificationGroupKey, EnrichedNotification[]> = {
      today: [],
      yesterday: [],
      week: [],
      older: [],
    };

    visibleNotifications.forEach((item) => {
      groups[item.groupKey].push(item);
    });

    return groups;
  }, [visibleNotifications]);

  const activeFilterCount = [
    query.trim(),
    typeFilter !== 'all',
    dateFilter !== 'all',
    branchFilter !== 'all',
    employeeFilter !== 'all',
  ].filter(Boolean).length;

  const primaryActionItem = useMemo(() => {
    return enrichedNotifications.find((item) => !item.isArchived && item.isActionable);
  }, [enrichedNotifications]);

  useEffect(() => {
    if (currentUserId) {
      void fetchNotifications(currentUserId);
    }
  }, [currentUserId, fetchNotifications]);

  useEffect(() => {
    const resolvedUnreadReviewNotificationIds = notifications
      .filter((notification) => {
        return !notification.is_read && isResolvedReviewRequestNotification(notification, submissions);
      })
      .map((notification) => notification.id);

    resolvedUnreadReviewNotificationIds.forEach((notificationId) => {
      void markAsRead(notificationId);
    });
  }, [markAsRead, notifications, submissions]);

  const handleMarkAllRead = async () => {
    if (currentUser?.id) {
      await markAllAsRead(currentUser.id);
    }
  };

  const handleArchiveRead = async () => {
    if (currentUser?.id) {
      await archiveReadNotifications(currentUser.id);
    }
  };

  const handleNotificationOpen = async (item: EnrichedNotification) => {
    if (!item.isRead) {
      await markAsRead(item.notification.id);
    }

    if (item.notification.link) {
      router.push(item.notification.link);
    }
  };

  const handleArchiveNotification = async (event: MouseEvent, notificationId: string) => {
    event.stopPropagation();
    await archiveNotification(notificationId);
  };

  const clearFilters = () => {
    setQuery('');
    setDateFilter('all');
    setTypeFilter('all');
    setBranchFilter('all');
    setEmployeeFilter('all');
  };

  const tabs = [
    { id: 'action' as const, label: isStaffView ? 'ต้องจัดการ' : 'ควรเปิดดู', count: stats.actionCount, icon: <AlertCircle className="h-4 w-4" /> },
    { id: 'unread' as const, label: 'ยังไม่อ่าน', count: stats.unreadCount, icon: <Inbox className="h-4 w-4" /> },
    { id: 'all' as const, label: 'ทั้งหมด', count: stats.totalCount, icon: <Bell className="h-4 w-4" /> },
    { id: 'archived' as const, label: 'เก็บแล้ว', count: stats.archivedCount, icon: <Archive className="h-4 w-4" /> },
  ];

  return (
    <div className="animate-fade-in px-3 py-5 pb-28 sm:px-4 lg:px-0">
      <div className={`${isStaffView ? 'max-w-6xl' : 'max-w-lg'} mx-auto space-y-5`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Link
              href={backHref}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 active:scale-95"
              aria-label="กลับ"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black leading-tight text-slate-950 sm:text-3xl">{title}</h1>
                {stats.unreadCount > 0 && (
                  <span className="inline-flex h-7 items-center rounded-full bg-primary-50 px-3 text-xs font-black text-primary-700 ring-1 ring-primary-100">
                    ใหม่ {compactCount(stats.unreadCount)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {getActionSummaryText(stats.actionCount, currentUser?.role)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {stats.unreadCount > 0 && (
              <Button variant="outline" size="sm" icon={<CheckCircle2 className="h-4 w-4" />} onClick={handleMarkAllRead}>
                อ่านทั้งหมด
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              icon={<Archive className="h-4 w-4" />}
              onClick={handleArchiveRead}
              disabled={enrichedNotifications.every((item) => !item.isRead || item.isArchived)}
              className="border border-slate-200 bg-white"
            >
              เก็บที่อ่านแล้ว
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SummaryCard
            color="primary"
            icon={<ShieldCheck className="h-5 w-5" />}
            label={isStaffView ? 'ต้องจัดการ' : 'ควรเปิดดู'}
            value={stats.actionCount}
            active={activeTab === 'action'}
            onClick={() => setActiveTab('action')}
          />
          <SummaryCard
            color="blue"
            icon={<Inbox className="h-5 w-5" />}
            label="ยังไม่อ่าน"
            value={stats.unreadCount}
            active={activeTab === 'unread'}
            onClick={() => setActiveTab('unread')}
          />
          <SummaryCard
            color="amber"
            icon={<ClipboardCheck className="h-5 w-5" />}
            label="งานรอตรวจ"
            value={reviewSummary?.count ?? stats.reviewCount}
            onClick={() => {
              setActiveTab('action');
              setTypeFilter('review');
            }}
          />
          <SummaryCard
            color="emerald"
            icon={<UserCircle className="h-5 w-5" />}
            label="คำขอ"
            value={stats.requestCount}
            onClick={() => {
              setActiveTab('action');
              setTypeFilter('system');
            }}
          />
          <SummaryCard
            color="slate"
            icon={<Bell className="h-5 w-5" />}
            label="ระบบ"
            value={stats.systemCount}
            onClick={() => {
              setActiveTab('all');
              setTypeFilter('system');
            }}
          />
        </div>

        {reviewSummary && reviewSummary.count > 0 && (
          <Link
            href={reviewSummary.href}
            className="group flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left shadow-sm shadow-amber-900/5 transition hover:border-amber-300 hover:bg-amber-100/70"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-amber-600 shadow-sm ring-1 ring-amber-100">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-black text-amber-950">{reviewSummary.title}</p>
                <p className="line-clamp-1 text-xs font-semibold text-amber-800/70">{reviewSummary.description}</p>
              </div>
            </div>
            <span className="inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl bg-amber-600 px-3 text-sm font-black text-white shadow-sm">
              {compactCount(reviewSummary.count)}
            </span>
          </Link>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-3 sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-black transition
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
                      ${activeTab === tab.id
                        ? 'bg-primary-700 text-white shadow-sm'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }
                    `}
                  >
                    {tab.icon}
                    {tab.label}
                    <span className={activeTab === tab.id ? 'text-white/75' : 'text-slate-400'}>
                      {compactCount(tab.count)}
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowFilters((value) => !value)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 shadow-sm transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 lg:hidden"
              >
                <Filter className="h-4 w-4" />
                ตัวกรอง
                {activeFilterCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-700 px-1 text-[10px] text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            <div className={`${showFilters ? 'mt-4 grid' : 'hidden'} gap-3 lg:mt-4 lg:grid lg:grid-cols-12`}>
              <div className="lg:col-span-4">
                <label className="mb-1.5 block text-xs font-black text-slate-500">ค้นหา</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="ค้นหาชื่องาน พนักงาน หรือสาขา"
                    className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
              </div>
              <div className="lg:col-span-2">
                <Select
                  label="ช่วงเวลา"
                  value={dateFilter}
                  options={dateFilterOptions}
                  onValueChange={(value) => setDateFilter(value as DateFilter)}
                />
              </div>
              <div className="lg:col-span-2">
                <Select
                  label="ประเภท"
                  value={typeFilter}
                  options={typeFilterOptions}
                  onValueChange={(value) => setTypeFilter(value as NotificationType | 'all')}
                />
              </div>
              {isStaffView && (
                <>
                  <div className="lg:col-span-2">
                    <Select
                      label="สาขา"
                      value={branchFilter}
                      options={branchOptions}
                      onValueChange={setBranchFilter}
                      searchable
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <Select
                      label="พนักงาน"
                      value={employeeFilter}
                      options={employeeOptions}
                      onValueChange={setEmployeeFilter}
                      searchable
                    />
                  </div>
                </>
              )}
              <div className="flex items-end lg:col-span-12 lg:justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<SlidersHorizontal className="h-4 w-4" />}
                  onClick={clearFilters}
                  disabled={activeFilterCount === 0}
                  className="border border-slate-200 bg-slate-50"
                >
                  ล้างตัวกรอง
                </Button>
              </div>
            </div>
          </div>

          <div className="grid min-h-[460px] lg:grid-cols-[250px_minmax(0,1fr)]">
            <aside className="hidden border-r border-slate-100 bg-slate-50/60 p-4 lg:block">
              <div className="space-y-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition
                      ${activeTab === tab.id ? 'bg-white text-primary-800 shadow-sm ring-1 ring-primary-100' : 'text-slate-600 hover:bg-white'}
                    `}
                  >
                    <span className="flex items-center gap-2 text-sm font-black">
                      {tab.icon}
                      {tab.label}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-500">
                      {compactCount(tab.count)}
                    </span>
                  </button>
                ))}
              </div>

              {primaryActionItem && (
                <div className="mt-5 rounded-2xl border border-primary-100 bg-primary-50 p-4">
                  <p className="text-xs font-black text-primary-800">รายการถัดไปที่ควรทำ</p>
                  <p className="mt-1 line-clamp-2 text-sm font-black text-slate-950">
                    {primaryActionItem.notification.title}
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    fullWidth
                    onClick={() => void handleNotificationOpen(primaryActionItem)}
                    className="mt-3"
                  >
                    {primaryActionItem.actionLabel}
                  </Button>
                </div>
              )}
            </aside>

            <section className="min-w-0 p-3 sm:p-4">
              {filteredNotifications.length === 0 ? (
                <EmptyState
                  activeTab={activeTab}
                  hasFilters={activeFilterCount > 0}
                  onClearFilters={clearFilters}
                />
              ) : (
                <div className="space-y-5">
                  {(['today', 'yesterday', 'week', 'older'] as NotificationGroupKey[]).map((groupKey) => {
                    const items = groupedNotifications[groupKey];
                    if (items.length === 0) return null;

                    return (
                      <div key={groupKey} className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <h2 className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                            {groupLabels[groupKey]}
                          </h2>
                          <span className="text-xs font-black text-slate-300">{items.length} รายการ</span>
                        </div>
                        <div className="space-y-2">
                          {items.map((item) => (
                            <NotificationRow
                              key={item.notification.id}
                              item={item}
                              onOpen={() => void handleNotificationOpen(item)}
                              onArchive={(event) => void handleArchiveNotification(event, item.notification.id)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {filteredNotifications.length > visibleLimit && (
                    <div className="flex justify-center pt-2">
                      <Button variant="outline" size="sm" onClick={() => setVisibleLimit((value) => value + 30)}>
                        โหลดเพิ่มอีก {Math.min(30, filteredNotifications.length - visibleLimit)} รายการ
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  active = false,
  color,
  icon,
  label,
  value,
  onClick,
}: {
  active?: boolean;
  color: EnrichedNotification['color'] | 'primary';
  icon: ReactNode;
  label: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        group flex min-h-[92px] cursor-pointer items-center justify-between rounded-2xl border bg-white p-4 text-left shadow-sm transition
        hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md active:translate-y-0
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
        ${active ? 'border-primary-200 ring-2 ring-primary-100' : 'border-slate-200'}
      `}
    >
      <div className="min-w-0">
        <p className="text-xs font-black text-slate-400">{label}</p>
        <p className="mt-2 text-3xl font-black tabular-nums text-slate-950">{compactCount(value)}</p>
      </div>
      <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 transition group-hover:scale-105 ${statToneClasses(color)}`}>
        {icon}
      </span>
    </button>
  );
}

function NotificationRow({
  item,
  onArchive,
  onOpen,
}: {
  item: EnrichedNotification;
  onArchive: (event: MouseEvent) => void;
  onOpen: () => void;
}) {
  const tone = rowToneClasses(item.color, item.isRead);
  const { notification } = item;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      className={`
        cursor-pointer
        group relative w-full overflow-hidden rounded-2xl border p-3 text-left transition
        hover:-translate-y-0.5 hover:shadow-md active:translate-y-0
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
        ${tone.container}
      `}
    >
      <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${tone.rail}`} />

      <div className="flex gap-3 pl-1">
        <span className={`mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${tone.icon}`}>
          {item.icon}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={`line-clamp-1 text-sm font-black ${item.isRead ? 'text-slate-800' : 'text-slate-950'}`}>
                  {notification.title}
                </h3>
                {!item.isRead && (
                  <span className="h-2 w-2 rounded-full bg-primary-600" aria-label="ยังไม่อ่าน" />
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-sm font-semibold leading-relaxed text-slate-500">
                {notification.message}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {notification.link && !item.isArchived && (
                <span className="hidden rounded-lg bg-white/80 px-3 py-2 text-xs font-black text-primary-700 ring-1 ring-primary-100 transition group-hover:bg-primary-700 group-hover:text-white sm:inline-flex">
                  {item.actionLabel}
                </span>
              )}
              {!item.isArchived && (
                <button
                  type="button"
                  onClick={onArchive}
                  onKeyDown={(event) => event.stopPropagation()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  aria-label="เก็บแจ้งเตือน"
                  title="เก็บแจ้งเตือน"
                >
                  <Archive className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-400">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-slate-500">
              {item.typeLabel}
            </span>
            {item.relatedUser && (
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-white px-2 py-1 text-slate-500 ring-1 ring-slate-100">
                <UserCircle className="h-3.5 w-3.5" />
                <span className="truncate">{item.relatedUser.full_name}</span>
              </span>
            )}
            {item.relatedBranch && (
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-white px-2 py-1 text-slate-500 ring-1 ring-slate-100">
                <MapPin className="h-3.5 w-3.5" />
                <span className="truncate">{item.relatedBranch.name}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatRelativeTime(notification.created_at)}
            </span>
            {!isDateToday(notification.created_at) && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatThaiDate(notification.created_at)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  activeTab,
  hasFilters,
  onClearFilters,
}: {
  activeTab: InboxTab;
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  const title = activeTab === 'action'
    ? 'ไม่มีรายการที่ต้องจัดการ'
    : activeTab === 'unread'
      ? 'อ่านครบแล้ว'
      : activeTab === 'archived'
        ? 'ยังไม่มีรายการที่เก็บ'
        : 'ยังไม่มีการแจ้งเตือน';

  const description = hasFilters
    ? 'ลองล้างตัวกรองหรือขยายช่วงเวลาเพื่อดูรายการเพิ่มเติม'
    : 'เมื่อมีรายการใหม่ ระบบจะจัดเข้ากลุ่มให้ดูง่ายอัตโนมัติ';

  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center px-4 text-center">
      <div className="relative">
        <span className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 text-slate-300 ring-1 ring-slate-200">
          <Inbox className="h-9 w-9" />
        </span>
        <span className="absolute -right-2 -top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-emerald-500 shadow-sm ring-1 ring-slate-100">
          <CheckCircle2 className="h-5 w-5" />
        </span>
      </div>
      <h2 className="mt-5 text-lg font-black text-slate-950">{title}</h2>
      <p className="mt-1 max-w-sm text-sm font-semibold leading-relaxed text-slate-500">{description}</p>
      {hasFilters && (
        <Button variant="outline" size="sm" onClick={onClearFilters} className="mt-4">
          ล้างตัวกรอง
        </Button>
      )}
    </div>
  );
}
