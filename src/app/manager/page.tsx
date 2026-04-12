'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { useTaskStore } from '@/store/taskStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useEmployeeStore } from '@/store/employeeStore';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import {
  Users,
  Clock,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  MapPin,
  Plus,
} from 'lucide-react';
import { formatThaiDate } from '@/lib/dateUtils';
import { getPendingReviewSubmissionsForUser } from '@/lib/reviewHelpers';

export default function ManagerDashboard() {
  const { currentUser } = useAuthStore();
  const taskStore = useTaskStore();
  const attendanceStore = useAttendanceStore();
  const employeeStore = useEmployeeStore();

  if (!currentUser) return null;

  const pendingSubmissions = getPendingReviewSubmissionsForUser(
    taskStore.submissions,
    currentUser,
    employeeStore.users,
  );
  const recentAttendance = attendanceStore.records.slice(0, 5);

  const stats = [
    {
      label: 'พนักงานทั้งหมด',
      value: employeeStore.users.length,
      icon: <Users className="w-5 h-5" />,
      color: 'bg-blue-500',
    },
    {
      label: 'เช็กอินแล้ววันนี้',
      value: attendanceStore.getAllTodayRecords().length,
      icon: <MapPin className="w-5 h-5" />,
      color: 'bg-emerald-500',
    },
    {
      label: 'งานรอยืนยัน',
      value: pendingSubmissions.length,
      icon: <ClipboardList className="w-5 h-5" />,
      color: 'bg-amber-500',
    },
    {
      label: 'งานล่าช้า',
      value: taskStore.getTaskStats().overdue,
      icon: <AlertTriangle className="w-5 h-5" />,
      color: 'bg-red-500',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ยินดีต้อนรับ, {currentUser.full_name}</h1>
          <p className="text-slate-500 text-sm mt-1">
            สรุปภาพรวมการทำงานประจำวันที่ {formatThaiDate(new Date().toISOString())}
          </p>
        </div>
        <Link href="/manager/assignments">
          <Button size="sm" icon={<Plus className="w-4 h-4" />}>มอบหมายงาน</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} padding="md" className="flex items-center gap-4 card-hover">
            <div className={`p-3 rounded-xl text-white ${stat.color} shadow-sm`}>{stat.icon}</div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary-600" /> การเข้างานล่าสุด
            </h2>
            <Link href="/manager/attendance" className="text-xs font-bold text-primary-600 hover:text-primary-700 transition-colors">
              ดูทั้งหมด
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recentAttendance.map((record) => {
              const employee = employeeStore.getUserById(record.user_id);

              return (
                <Card key={record.id} padding="md" className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 border border-slate-200 shadow-sm shrink-0">
                    {employee?.full_name?.charAt(0) || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-sm font-bold text-slate-900 truncate">{employee?.full_name || 'ไม่ทราบชื่อ'}</p>
                      <Badge variant={record.status === 'checked_in' || record.status === 'checked_out' ? 'success' : 'warning'} size="sm">
                        {record.type === 'check_in' ? 'เช็กอิน' : 'เช็กเอาต์'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500 font-medium tracking-wide">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3 opacity-70" /> {new Date(record.created_at).toLocaleTimeString('th-TH')}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3 opacity-70" /> {record.verified_in_geofence ? 'ภายในพื้นที่' : 'นอกพื้นที่'}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <Card className="h-full flex flex-col pt-5" padding="none">
            <div className="px-5 flex justify-between items-center mb-4">
              <h2 className="text-base font-bold text-slate-900">รอตรวจ</h2>
              <Badge variant="warning" size="sm">{pendingSubmissions.length}</Badge>
            </div>

            <div className="flex-1 overflow-y-auto px-5 space-y-3 pb-5">
              {pendingSubmissions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <CheckCircle2 className="w-10 h-10 text-slate-200 mb-3" />
                  <p className="text-xs text-slate-400 font-medium whitespace-pre-wrap">ตรวจงานครบแล้ว</p>
                </div>
              ) : (
                pendingSubmissions.slice(0, 6).map((submission) => {
                  const employee = employeeStore.getUserById(submission.submitted_by);
                  const task = taskStore.getTaskById(submission.task_id);
                  const template = task?.template_id ? taskStore.getTemplateById(task.template_id) : null;

                  return (
                    <Link key={submission.id} href={`/manager/review/${submission.id}`}>
                      <div className="p-3 bg-slate-50 rounded-xl border border-transparent hover:border-primary-200 hover:bg-primary-50/30 transition-all flex justify-between items-center group">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{task?.title || template?.title || 'งาน'}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{employee?.full_name || 'ไม่ทราบชื่อ'}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all" />
                      </div>
                    </Link>
                  );
                })
              )}
            </div>

            {pendingSubmissions.length > 6 && (
              <Link href="/manager/review" className="mx-5 mb-5 block text-center text-xs font-bold text-primary-600 py-3 bg-primary-50 rounded-xl hover:bg-primary-100 transition-colors">
                ดูงานค้างอีก {pendingSubmissions.length - 6} รายการ
              </Link>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
