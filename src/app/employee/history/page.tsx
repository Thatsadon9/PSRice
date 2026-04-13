'use client';
/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { useState } from 'react';
import { addDays, format } from 'date-fns';
import { th } from 'date-fns/locale';
import { useSearchParams } from 'next/navigation';
import {
  CalendarDays,
  ClipboardList,
  Clock,
  MapPin,
  Zap,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import Tabs from '@/components/ui/Tabs';
import StarRating from '@/components/ui/StarRating';
import {
  ATTENDANCE_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
  SHIFT_ASSIGNMENT_STATUS_LABELS,
} from '@/lib/constants';
import { formatThaiDate, formatTime } from '@/lib/dateUtils';
import { createLocalDateTime, resolveShiftForUserDate } from '@/lib/hr';
import { parseReviewFeedback } from '@/lib/reviewFeedback';
import { useAuthStore } from '@/store/authStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useHrStore } from '@/store/hrStore';
import { useTaskStore } from '@/store/taskStore';

type HistoryTab = 'attendance' | 'tasks' | 'schedule';

function isHistoryTab(value: string | null): value is HistoryTab {
  return value === 'attendance' || value === 'tasks' || value === 'schedule';
}

function getAttendanceStatusVariant(status: string) {
  switch (status) {
    case 'checked_in':
    case 'checked_out':
      return 'success' as const;
    case 'late':
      return 'warning' as const;
    default:
      return 'danger' as const;
  }
}

function getReviewStatusVariant(status: string) {
  switch (status) {
    case 'approved':
      return 'success' as const;
    case 'rejected':
      return 'danger' as const;
    default:
      return 'warning' as const;
  }
}

function getShiftVariant(status: 'scheduled' | 'day_off' | 'leave' | 'holiday') {
  switch (status) {
    case 'scheduled':
      return 'success' as const;
    case 'leave':
      return 'warning' as const;
    case 'day_off':
    case 'holiday':
      return 'info' as const;
    default:
      return 'default' as const;
  }
}

export default function HistoryPage() {
  const searchParams = useSearchParams();
  const currentUser = useAuthStore((state) => state.currentUser);
  const attendanceStore = useAttendanceStore();
  const taskStore = useTaskStore();
  const branchPolicies = useHrStore((state) => state.branchPolicies);
  const shiftAssignments = useHrStore((state) => state.shiftAssignments);

  const [manualActiveTab, setManualActiveTab] = useState<HistoryTab | null>(null);
  const requestedTab = searchParams.get('tab');
  const activeTab = manualActiveTab || (isHistoryTab(requestedTab) ? requestedTab : 'attendance');

  if (!currentUser) {
    return null;
  }

  const attendanceRecords = attendanceStore.getRecordsByUser(currentUser.id).sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );

  const submissions = taskStore.getSubmissionsByUser(currentUser.id).sort(
    (left, right) => new Date(right.submitted_at).getTime() - new Date(left.submitted_at).getTime(),
  );

  const schedulePreview = Array.from({ length: 14 }, (_, index) => {
    const workDate = format(addDays(new Date(), index), 'yyyy-MM-dd');
    return {
      workDate,
      shift: resolveShiftForUserDate({
        user: currentUser,
        workDate,
        assignments: shiftAssignments,
        branchPolicies,
      }),
    };
  });

  const tabs = [
    { id: 'attendance', label: 'ประวัติเข้างาน', icon: <Clock className="w-4 h-4" /> },
    { id: 'tasks', label: 'ประวัติส่งงาน', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'schedule', label: 'ตารางกะ', icon: <CalendarDays className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6 px-4 py-8 pb-24 animate-fade-in max-w-lg mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-slate-900 leading-tight">ประวัติและพอร์ต</h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Your Work Ledger</p>
        </div>
        <div className="h-12 w-12 rounded-2xl bg-slate-900 flex items-center justify-center text-primary-400">
           <Zap className="w-6 h-6 fill-primary-400/20" />
        </div>
      </div>

      <div className="p-1.5 bg-slate-100 rounded-[2rem] flex gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setManualActiveTab(tab.id as HistoryTab)}
            className={`
              flex-1 py-3.5 px-2 rounded-[1.75rem] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all
              ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}
            `}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {activeTab === 'attendance' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between px-1">
               <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Timeline Logs</h2>
               <Badge variant="blue" className="text-[9px] px-2 py-0.5 font-black uppercase tracking-tight">{attendanceRecords.length} Entries</Badge>
            </div>
            
            <div className="relative space-y-6 before:absolute before:inset-0 before:ml-[23px] before:-translate-x-px before:h-full before:w-1 before:bg-slate-100">
              {attendanceRecords.map((record) => {
                const isCheckIn = record.type === 'check_in';
                const statusVariant = getAttendanceStatusVariant(record.status);

                return (
                  <div key={record.id} className="relative pl-12 group">
                    <div
                      className={`absolute left-0 top-2 flex h-12 w-12 items-center justify-center rounded-2xl border-4 border-white shadow-lg z-10 transition-transform group-hover:scale-110 ${
                        isCheckIn ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'
                      }`}
                    >
                      {isCheckIn ? <MapPin className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                    </div>

                    <Card className="p-0 overflow-hidden border-slate-100 rounded-[2rem] shadow-sm hover:shadow-md transition-shadow">
                      <div className={`h-1.5 w-full ${
                        statusVariant === 'success' ? 'bg-emerald-500' :
                        statusVariant === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                      }`} />
                      
                      <div className="p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="h-16 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-50 border border-slate-100">
                            <img src={record.photo_url} alt="Proof" className="h-full w-full object-cover grayscale-[20%]" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-900">
                              {isCheckIn ? 'เข้างาน (In)' : 'ออกงาน (Out)'} {formatTime(record.created_at)}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                               {formatThaiDate(record.created_at)}
                            </p>
                            {record.notes && <p className="mt-2 text-[10px] font-black text-red-500 bg-red-50 px-2 py-1 rounded-lg w-fit">{record.notes}</p>}
                          </div>
                        </div>
                        <Badge variant={statusVariant} size="sm" className="font-black uppercase text-[9px] tracking-tight">
                          {ATTENDANCE_STATUS_LABELS[record.status]}
                        </Badge>
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
               <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Assignment Proofs</h2>
               <Badge variant="primary" className="text-[9px] px-2 py-0.5 font-black uppercase tracking-tight">{submissions.length} Total</Badge>
            </div>

            <div className="space-y-3">
              {submissions.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-[2.5rem] border border-dashed border-slate-200">
                   <ClipboardList className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                   <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No submission history</p>
                </div>
              ) : (
                submissions.map((submission) => {
                  const task = taskStore.getTaskById(submission.task_id);
                  const template = task?.template_id ? taskStore.getTemplateById(task.template_id) : null;
                  const feedback = parseReviewFeedback(submission.review_comment, submission.review_rating);
                  const reviewVariant = getReviewStatusVariant(submission.review_status);

                  return (
                    <Link key={submission.id} href={`/employee/tasks/${submission.task_id}`}>
                      <Card interactive className="p-0 overflow-hidden border-slate-100 rounded-[2rem] group transition-all">
                        <div className={`h-1.5 w-full ${
                          reviewVariant === 'success' ? 'bg-emerald-500' :
                          reviewVariant === 'danger' ? 'bg-red-500' : 'bg-primary-500'
                        }`} />
                        
                        <div className="p-5">
                          <div className="flex items-start justify-between gap-4 mb-4">
                             <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-primary-600 font-black group-hover:bg-primary-50 transition-colors">
                                   {task?.title?.charAt(0) || template?.title?.charAt(0) || 'T'}
                                </div>
                                <div className="min-w-0">
                                   <h3 className="text-sm font-black text-slate-900 group-hover:text-primary-600 transition-colors truncate">{task?.title || template?.title || 'งาน'}</h3>
                                   <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest leading-none">Submitted {formatThaiDate(submission.submitted_at)}</p>
                                </div>
                             </div>
                             <Badge variant={reviewVariant} size="sm" dot className="font-black uppercase text-[9px] tracking-tight">
                                {REVIEW_STATUS_LABELS[submission.review_status]}
                             </Badge>
                          </div>

                          {submission.note && (
                            <p className="text-xs font-bold text-slate-500 bg-slate-50/50 p-3 rounded-xl border border-slate-50 mb-4 line-clamp-1 italic">
                               &quot;{submission.note}&quot;
                            </p>
                          )}

                          {feedback.rating != null && (
                            <div className="flex items-center justify-between bg-slate-900 px-4 py-3 rounded-[1.25rem]">
                               <p className="text-[9px] font-black text-primary-400 uppercase tracking-widest">Performance Rating</p>
                               <StarRating value={feedback.rating} readOnly size="sm" />
                            </div>
                          )}
                        </div>
                      </Card>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'schedule' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
               <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Upcoming Shifts</h2>
               <Link href="/employee/schedule" className="text-[10px] font-black text-primary-600 bg-primary-100 px-3 py-1.5 rounded-full">Calendar View</Link>
            </div>

            <div className="space-y-2">
              {schedulePreview.map((item) => {
                const isToday = format(new Date(), 'yyyy-MM-dd') === item.workDate;
                const shiftVariant = getShiftVariant(item.shift.status);
                
                return (
                  <Card key={item.workDate} className={`p-4 border-slate-100 rounded-3xl ${isToday ? 'ring-2 ring-primary-500 bg-primary-50/30' : 'bg-white'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="text-center w-12">
                          <p className="text-[10px] font-black text-slate-400 uppercase">{format(new Date(item.workDate), 'EEE', { locale: th })}</p>
                          <p className="text-xl font-black text-slate-900">{format(new Date(item.workDate), 'd')}</p>
                        </div>
                        <div className="h-10 border-l border-slate-100" />
                        <div>
                          <p className="text-sm font-bold text-slate-900">{item.shift.shift_name}</p>
                          <p className="text-[10px] font-bold text-slate-400">{item.shift.start_time} - {item.shift.end_time}</p>
                          <p className="text-[9px] font-black text-slate-300 uppercase tracking-tighter mt-1">{item.shift.source === 'assignment' ? 'Direct Assign' : 'Branch Default'}</p>
                        </div>
                      </div>
                      <Badge variant={shiftVariant} size="sm" className="font-black uppercase text-[9px] tracking-tight">
                        {SHIFT_ASSIGNMENT_STATUS_LABELS[item.shift.status]}
                      </Badge>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
