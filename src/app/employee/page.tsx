'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useTaskStore } from '@/store/taskStore';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { 
  MapPin, Clock, ClipboardList, CheckCircle2, 
  ArrowRight, Calendar, Bell, Shield, LogOut, History
} from 'lucide-react';
import { formatThaiDate, isDateToday } from '@/lib/dateUtils';
import { TASK_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';
import type { Priority } from '@/lib/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function EmployeeDashboard() {
  const { currentUser, logout } = useAuthStore();
  const attendanceStore = useAttendanceStore();
  const taskStore = useTaskStore();
  const router = useRouter();

  if (!currentUser) return null;

  const todayAttendance = attendanceStore.getTodayRecordForUser(currentUser.id);
  const isCheckedIn = !!todayAttendance.checkIn;
  const isCheckedOut = !!todayAttendance.checkOut;
  
  const todayTasks = taskStore.getTodayTasksByUser(currentUser.id);
  const taskStats = taskStore.getTaskStats(currentUser.id);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <div className="px-4 py-4 space-y-6 animate-fade-in pb-20">
      {/* Header Profile */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full border-2 border-primary-100 p-0.5 bg-white">
            <div className="w-full h-full rounded-full bg-primary-600 flex items-center justify-center text-white font-bold text-lg">
              {currentUser.full_name.charAt(0)}
            </div>
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-tight">{currentUser.full_name}</h1>
            <p className="text-xs text-slate-500 font-medium">{currentUser.role === 'employee' ? 'พนักงานทั่วไป' : 'ผู้เชี่ยวชาญ'}</p>
          </div>
        </div>
        <div className="flex gap-2">
           <Link href="/employee/notifications" className="p-2 rounded-full bg-slate-100 text-slate-500 relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 border-2 border-white rounded-full"></span>
           </Link>
           <button onClick={handleLogout} className="p-2 rounded-full bg-red-50 text-red-500">
              <LogOut className="w-5 h-5" />
           </button>
        </div>
      </div>

      {/* Attendance Status Card - Interactive */}
      <Card className="bg-gradient-to-br from-primary-600 to-primary-800 text-white border-none shadow-lg shadow-primary-200">
        <div className="space-y-4">
           <div className="flex justify-between items-start">
              <div className="space-y-1">
                 <p className="text-primary-100 text-[10px] font-bold uppercase tracking-widest">สถานะปัจจุบัน</p>
                 <h2 className="text-xl font-bold flex items-center gap-2">
                    {isCheckedOut ? 'เลิกงานแล้ว' : isCheckedIn ? 'กำลังปฏิบัติงาน' : 'ยังไม่ได้เข้างาน'}
                    <div className={`w-2 h-2 rounded-full animate-pulse ${isCheckedIn && !isCheckedOut ? 'bg-emerald-400' : 'bg-slate-300'}`}></div>
                 </h2>
              </div>
              <Badge variant="default" className="bg-white/10 border-white/20 text-white">
                 {formatThaiDate(new Date().toISOString())}
              </Badge>
           </div>

           <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm border border-white/10">
                 <p className="text-[10px] text-primary-100 font-medium mb-1">เข้างาน</p>
                 <p className="text-lg font-bold">{todayAttendance.checkIn ? new Date(todayAttendance.checkIn.created_at).toLocaleTimeString('th-TH').slice(0, 5) : '--:--'}</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm border border-white/10">
                 <p className="text-[10px] text-primary-100 font-medium mb-1">ออกงาน</p>
                 <p className="text-lg font-bold">{todayAttendance.checkOut ? new Date(todayAttendance.checkOut.created_at).toLocaleTimeString('th-TH').slice(0, 5) : '--:--'}</p>
              </div>
           </div>

           {!isCheckedIn && (
             <Link href="/employee/check-in" className="block w-full">
                <Button fullWidth variant="outline" className="bg-white text-primary-700 hover:bg-primary-50">
                  <MapPin className="w-4 h-4" /> เริ่มบันทึกเวลา
                </Button>
             </Link>
           )}
           {isCheckedIn && !isCheckedOut && (
             <Link href="/employee/check-in" className="block w-full">
                <Button fullWidth variant="outline" className="bg-white/20 border-white/40 hover:bg-white/30 text-white">
                  เลิกงาน / เช็กเอาต์
                </Button>
             </Link>
           )}
        </div>
      </Card>

      {/* Task Summary */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary-600" /> งานประจำวัน
          </h2>
          <Link href="/employee/tasks" className="text-xs font-bold text-primary-600">
            ดูทั้งหมด ({taskStats.pending + taskStats.inProgress})
          </Link>
        </div>

        {/* Task Stats Row */}
        <div className="grid grid-cols-3 gap-2">
           <div className="bg-emerald-50 rounded-xl p-2.5 border border-emerald-100">
              <p className="text-lg font-bold text-emerald-700">{taskStats.approved}</p>
              <p className="text-[9px] text-emerald-600 font-bold uppercase">สำเร็จ</p>
           </div>
           <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-100">
              <p className="text-lg font-bold text-blue-700">{taskStats.inProgress + taskStats.submitted}</p>
              <p className="text-[9px] text-blue-600 font-bold uppercase">กำลังทำ</p>
           </div>
           <div className="bg-red-50 rounded-xl p-2.5 border border-red-100">
              <p className="text-lg font-bold text-red-700">{taskStats.overdue}</p>
              <p className="text-[9px] text-red-600 font-bold uppercase">ล่าช้า</p>
           </div>
        </div>

        {/* Task list */}
        <div className="space-y-2">
          {todayTasks.length === 0 ? (
            <Card>
              <div className="text-center py-4">
                <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">ไม่มีงานสำหรับวันนี้</p>
              </div>
            </Card>
          ) : (
            todayTasks.slice(0, 5).map(task => {
              const template = (task && task.template_id) ? taskStore.getTemplateById(task.template_id) : null;
              const statusBadgeVariant = (() => {
                switch (task.status) {
                  case 'approved': return 'success';
                  case 'submitted': return 'warning';
                  case 'rejected': case 'overdue': return 'danger';
                  case 'in_progress': return 'info';
                  default: return 'default';
                }
              })() as 'success' | 'warning' | 'danger' | 'info' | 'default';

              const priorityVariant = (() => {
                const priority = task.priority || template?.priority;
                switch (priority) {
                  case 'critical': return 'danger';
                  case 'high': return 'warning';
                  case 'medium': return 'info';
                  default: return 'slate';
                }
              })() as 'danger' | 'warning' | 'info' | 'slate';

              return (
                <Link key={task.id} href={`/employee/tasks/${task.id}`}>
                  <Card interactive className="p-3">
                    <div className="flex justify-between items-start">
                       <div className="flex-1 min-w-0 pr-2">
                          <p className="text-sm font-bold text-slate-900 truncate">{task.title || template?.title || 'งาน'}</p>
                          <div className="flex items-center gap-2 mt-1">
                             <Badge variant={statusBadgeVariant} size="sm" dot>{TASK_STATUS_LABELS[task.status]}</Badge>
                             {(task.priority || template?.priority) && (
                               <Badge variant={priorityVariant} size="sm">{PRIORITY_LABELS[(task.priority || template?.priority || 'medium') as Priority]}</Badge>
                             )}
                          </div>
                       </div>
                       <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className={`p-1.5 rounded-lg ${task.status === 'approved' ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-50 text-slate-400'}`}>
                             <ArrowRight className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] text-slate-400 font-medium">ส่งใน {new Date(task.due_date).toLocaleTimeString('th-TH').slice(0, 5)} น.</span>
                       </div>
                    </div>
                  </Card>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 bg-white rounded-3xl p-1 shadow-sm border border-slate-100">
         <Link href="/employee/history" className="flex flex-col items-center justify-center p-5 border-r border-slate-50">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl mb-3">
               <History className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold text-slate-700">ประวัติงาน</span>
         </Link>
         <Link href="/employee/settings" className="flex flex-col items-center justify-center p-5">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl mb-3">
               <Bell className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold text-slate-700">ตั้งค่าแอป</span>
         </Link>
      </div>

      <div className="grid grid-cols-1 pt-2">
         <Link href="/employee/profile">
            <Card interactive className="flex items-center gap-4 p-4 border-slate-100">
               <div className="p-3 bg-slate-50 text-slate-600 rounded-2xl">
                  <Shield className="w-6 h-6" />
               </div>
               <div>
                  <span className="text-sm font-bold text-slate-700 block">โปรไฟล์ของคุณ</span>
                  <span className="text-[10px] text-slate-400 font-medium">จัดการข้อมูลส่วนตัวและความปลอดภัย</span>
               </div>
            </Card>
         </Link>
      </div>

    </div>
  );
}
