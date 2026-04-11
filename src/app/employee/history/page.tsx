'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useTaskStore } from '@/store/taskStore';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Tabs from '@/components/ui/Tabs';
import { Clock, MapPin, CheckCircle2, XCircle, ArrowRight, ClipboardList } from 'lucide-react';
import { formatThaiDate, formatTime } from '@/lib/dateUtils';
import { ATTENDANCE_STATUS_LABELS, REVIEW_STATUS_LABELS } from '@/lib/constants';
import Link from 'next/link';

export default function HistoryPage() {
  const { currentUser } = useAuthStore();
  const attendanceStore = useAttendanceStore();
  const taskStore = useTaskStore();
  
  const [activeTab, setActiveTab] = useState('attendance');

  if (!currentUser) return null;

  const attendanceRecords = attendanceStore.getRecordsByUser(currentUser.id).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  
  const submissions = taskStore.getSubmissionsByUser(currentUser.id).sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  );

  const tabs = [
    { id: 'attendance', label: 'ประวัติเข้างาน', icon: <Clock className="w-4 h-4" /> },
    { id: 'tasks', label: 'ประวัติส่งงาน', icon: <ClipboardList className="w-4 h-4" /> },
  ];

  const getAttendanceStatusVariant = (status: string) => {
    switch (status) {
      case 'checked_in': case 'checked_out': return 'success';
      case 'late': return 'warning';
      default: return 'danger';
    }
  };

  const getReviewStatusVariant = (status: string) => {
    switch (status) {
      case 'approved': return 'success';
      case 'rejected': return 'danger';
      default: return 'warning';
    }
  };

  return (
    <div className="px-4 py-4 space-y-4 animate-fade-in">
      <h1 className="text-lg font-bold text-slate-900">ประวัติ</h1>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'attendance' && (
        <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[19px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-slate-200">
          {attendanceRecords.map(record => {
            const isCheckIn = record.type === 'check_in';
            return (
              <div key={record.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm
                  ${isCheckIn ? 'bg-emerald-500' : 'bg-blue-500'}
                `}>
                  {isCheckIn ? <MapPin className="w-4 h-4 text-white" /> : <Clock className="w-4 h-4 text-white" />}
                </div>
                
                <Card className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] ml-4 md:ml-0 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-500">{formatThaiDate(record.created_at)}</span>
                    <Badge variant={getAttendanceStatusVariant(record.status) as 'success' | 'warning' | 'danger'} size="sm">
                      {ATTENDANCE_STATUS_LABELS[record.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-16 bg-slate-100 rounded-md overflow-hidden shrink-0">
                      <img src={record.photo_url} alt="Proof" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {isCheckIn ? 'เช็กอิน' : 'เช็กเอาต์'} {formatTime(record.created_at)}
                      </p>
                      {record.notes && <p className="text-xs text-red-600 mt-1">{record.notes}</p>}
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="space-y-2">
           {submissions.map(sub => {
              const task = taskStore.getTaskById(sub.task_id);
              const template = (task && task.template_id) ? taskStore.getTemplateById(task.template_id) : null;
              
              return (
                <Link key={sub.id} href={`/employee/tasks/${sub.task_id}`}>
                <Card interactive className="p-3">
                  <div className="flex justify-between items-start mb-2">
                     <div>
                       <Badge variant={getReviewStatusVariant(sub.review_status) as 'success' | 'warning' | 'danger'} size="sm" dot>
                          {REVIEW_STATUS_LABELS[sub.review_status]}
                        </Badge>
                     </div>
                     <span className="text-xs font-medium text-slate-500">{formatThaiDate(sub.submitted_at)}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">{task?.title || template?.title || 'งาน'}</h3>
                  <div className="mt-2 text-xs text-slate-600 line-clamp-1">{sub.note}</div>
                  
                  {sub.review_status === 'rejected' && sub.review_comment && (
                     <div className="mt-2 p-2 bg-red-50 text-red-700 text-xs rounded border border-red-100 flex gap-2 items-start">
                        <XCircle className="w-4 h-4 shrink-0" />
                        <span>{sub.review_comment}</span>
                     </div>
                  )}
                  {sub.review_status === 'approved' && sub.review_comment && (
                     <div className="mt-2 p-2 bg-emerald-50 text-emerald-700 text-xs rounded border border-emerald-100 flex gap-2 items-start">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>{sub.review_comment}</span>
                     </div>
                  )}
                </Card>
                </Link>
              )
           })}
        </div>
      )}
    </div>
  );
}
