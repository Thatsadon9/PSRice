'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardList,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import Tabs from '@/components/ui/Tabs';
import { TASK_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';
import {
  formatThaiDate,
  getCurrentDateStr,
  isDateToday,
  isDateWithinRange,
  isSameCalendarDate,
} from '@/lib/dateUtils';
import type { Priority } from '@/lib/types';
import { useAuthStore } from '@/store/authStore';
import { useTaskStore } from '@/store/taskStore';

export default function MyTasksPage() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const taskStore = useTaskStore();
  const [activeTab, setActiveTab] = useState('today');

  if (!currentUser) return null;

  const allTasks = taskStore.getTasksByUser(currentUser.id);
  const today = getCurrentDateStr();
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);

  const tabs = [
    {
      id: 'today',
      label: 'วันนี้',
      count: allTasks.filter((task) => isSameCalendarDate(task.due_date, today)).length,
    },
    {
      id: 'week',
      label: 'สัปดาห์นี้',
      count: allTasks.filter((task) => isDateWithinRange(task.due_date, today, weekEnd)).length,
    },
    { id: 'overdue', label: 'เลยกำหนด', count: allTasks.filter((task) => task.status === 'overdue').length },
    { id: 'all', label: 'ทั้งหมด', count: allTasks.length },
  ];

  const filteredTasks = (() => {
    switch (activeTab) {
      case 'today':
        return allTasks.filter((task) => isSameCalendarDate(task.due_date, today));
      case 'week':
        return allTasks.filter((task) => isDateWithinRange(task.due_date, today, weekEnd));
      case 'overdue':
        return allTasks.filter((task) => task.status === 'overdue');
      default:
        return allTasks;
    }
  })().sort((a, b) => {
    const statusOrder: Record<string, number> = {
      overdue: 0,
      pending: 1,
      in_progress: 2,
      submitted: 3,
      rejected: 4,
      approved: 5,
    };

    return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
  });

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'submitted':
        return 'warning';
      case 'rejected':
      case 'overdue':
        return 'danger';
      case 'in_progress':
        return 'info';
      default:
        return 'default';
    }
  };

  const getPriorityVariant = (priority?: string) => {
    switch (priority) {
      case 'critical':
        return 'danger';
      case 'high':
        return 'warning';
      case 'medium':
        return 'info';
      default:
        return 'slate';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'overdue':
      case 'rejected':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default:
        return <ClipboardList className="w-4 h-4 text-primary-600" />;
    }
  };

  return (
    <div className="px-4 py-4 space-y-4 animate-fade-in">
      <h1 className="text-lg font-bold text-slate-900">งานของฉัน</h1>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} variant="pill" />

      {filteredTasks.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">ไม่มีงานในหมวดนี้</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => {
            const template = task.template_id ? taskStore.getTemplateById(task.template_id) : null;

            return (
              <Link key={task.id} href={`/employee/tasks/${task.id}`}>
                <Card interactive className="flex items-start gap-3 mb-2">
                  <div
                    className={`
                      mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
                      ${task.status === 'approved' ? 'bg-emerald-100' :
                        task.status === 'overdue' || task.status === 'rejected' ? 'bg-red-100' :
                        task.status === 'in_progress' ? 'bg-blue-100' : 'bg-slate-100'}
                    `}
                  >
                    {getStatusIcon(task.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {task.title || template?.title || 'งาน'}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge
                        variant={getStatusVariant(task.status) as 'success' | 'warning' | 'danger' | 'info' | 'default'}
                        size="sm"
                      >
                        {TASK_STATUS_LABELS[task.status]}
                      </Badge>
                      {(task.priority || template?.priority) && (
                        <Badge
                          variant={getPriorityVariant(task.priority || template?.priority) as 'danger' | 'warning' | 'info' | 'slate'}
                          size="sm"
                        >
                          {PRIORITY_LABELS[(task.priority || template?.priority || 'medium') as Priority]}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {isDateToday(task.due_date) ? 'วันนี้' : formatThaiDate(task.due_date)}
                      </span>
                      {task.checklist_state && task.checklist_state.length > 0 && (
                        <span>
                          {task.checklist_state.filter((item) => item.completed).length}/{task.checklist_state.length} รายการ
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 mt-2 flex-shrink-0" />
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
