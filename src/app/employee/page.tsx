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
  ArrowRight, Calendar, Bell, Shield, LogOut, History, Camera, ChevronRight, AlertCircle
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

  useEffect(() => {
    attendanceStore.fetchRecords();
    taskStore.fetchInitialData();
  }, []);

  if (!currentUser) return null;

  const todayAttendance = attendanceStore.getTodayRecordForUser(currentUser.id);
  const isCheckedIn = !!todayAttendance.checkIn;
  const isCheckedOut = !!todayAttendance.checkOut;
  const status = attendanceStore.getTodayStatus(currentUser.id);
  
  const myTasks = taskStore.getTasksByUser(currentUser.id);
  const activeTasks = myTasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const completedTasksCount = myTasks.filter(t => t.status === 'approved').length;

  return (
    <div className="px-4 py-6 space-y-6 animate-fade-in pb-20">
      {/* Header with improved aesthetics */}
      <div className="flex justify-between items-start">
        <div className="space-y-1">
           <p className="text-xs font-bold text-primary-600 uppercase tracking-wider">ยินดีต้อนรับกลับมา</p>
           <h1 className="text-2xl font-black text-slate-900 leading-tight">สวัสดี, {currentUser.full_name?.split(' ')[0]} 👋</h1>
           <p className="text-sm text-slate-500 font-medium">{formatThaiDate(new Date().toISOString())}</p>
        </div>
        <Link href="/employee/notifications" className="relative p-2.5 bg-white rounded-2xl shadow-sm border border-slate-100 text-slate-400 hover:text-primary-600 transition-colors">
          <Bell className="w-6 h-6" />
          <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
        </Link>
      </div>

      {/* Attendance Card with premium design */}
      <Card className="p-6 bg-slate-900 text-white border-none shadow-xl shadow-slate-200 relative overflow-hidden group">
         {/* Decorative background elements */}
         <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-primary-500/20 transition-all duration-500"></div>
         <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-500/10 rounded-full -ml-12 -mb-12 blur-2xl group-hover:bg-blue-500/20 transition-all duration-500"></div>
         
         <div className="relative z-10 space-y-6">
            <div className="flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
                     <Clock className="w-5 h-5 text-primary-300" />
                  </div>
                  <h2 className="font-bold text-lg">บันทึกเวลาวันนี้</h2>
               </div>
               <Badge variant={status === 'not_checked_in' ? 'default' : 'success'} className="bg-white/10 text-white border-none backdrop-blur-md px-3 py-1">
                  {status === 'not_checked_in' ? 'ยังไม่มีบันทึก' : status === 'checked_in' ? 'เช็กอินแล้ว' : status === 'late' ? 'มาสาย' : 'เช็กเอาต์แล้ว'}
               </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="bg-white/5 p-4 rounded-3xl border border-white/5 space-y-1">
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest text-center">เวลาเข้า</p>
                  <p className="text-xl font-black text-center">{todayAttendance.checkIn ? new Date(todayAttendance.checkIn.created_at).toLocaleTimeString('th-TH').slice(0, 5) : '--:--'}</p>
               </div>
               <div className="bg-white/5 p-4 rounded-3xl border border-white/5 space-y-1">
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest text-center">เวลาออก</p>
                  <p className="text-xl font-black text-center">{todayAttendance.checkOut ? new Date(todayAttendance.checkOut.created_at).toLocaleTimeString('th-TH').slice(0, 5) : '--:--'}</p>
               </div>
            </div>

            {status !== 'checked_out' && (
               <Link href="/employee/check-in">
                  <Button fullWidth className="bg-primary-500 hover:bg-primary-600 text-white border-none h-14 rounded-2xl shadow-lg shadow-primary-500/20 text-sm font-bold gap-2">
                     <Camera className="w-5 h-5" />
                     {status === 'not_checked_in' ? 'เช็กอินเข้าทำงาน' : 'เช็กเอาต์ออกงาน'}
                  </Button>
               </Link>
            )}
         </div>
      </Card>

      {/* Stats Section */}
      <div className="grid grid-cols-2 gap-4">
         <Card className="p-4 bg-white border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
               <ClipboardList className="w-5 h-5" />
            </div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase">งานรอดำเนินการ</p>
               <p className="text-xl font-black text-slate-900">{activeTasks.length}</p>
            </div>
         </Card>
         <Card className="p-4 bg-white border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
               <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase">สำเร็จแล้ว</p>
               <p className="text-xl font-black text-slate-900">{completedTasksCount}</p>
            </div>
         </Card>
      </div>

      {/* Task Section */}
      <div className="space-y-4">
         <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-black text-slate-900">งานที่คุณได้รับมอบหมาย</h2>
            <Link href="/employee/tasks" className="text-xs font-bold text-primary-600 bg-primary-50 px-3 py-1.5 rounded-full">ดูรายการทั้งหมด</Link>
         </div>

         <div className="space-y-3">
            {activeTasks.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                <div className="p-4 bg-white rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-3 shadow-sm">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <p className="text-sm font-bold text-slate-500">ไม่มีงานค้างในขณะนี้!</p>
                <p className="text-xs text-slate-400 mt-1">คุณจัดการงานวันนี้เสร็จหมดแล้ว</p>
              </div>
            ) : (
              activeTasks.slice(0, 3).map(task => {
                const tmpl = task.template_id ? taskStore.getTemplateById(task.template_id) : null;
                return (
                  <Link key={task.id} href={`/employee/tasks/${task.id}`}>
                    <Card interactive className="p-4 border-slate-100 card-hover">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 group">
                          <p className="text-sm font-bold text-slate-900 group-hover:text-primary-600 transition-colors uppercase tracking-tight">{task.title || tmpl?.title}</p>
                          <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {tmpl?.priority || 'ทั่วไป'}</span>
                            <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3" /> ด่วน</span>
                          </div>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-xl group-hover:bg-primary-50 transition-colors">
                          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary-500" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })
            )}
         </div>
      </div>
    </div>
  );
}
