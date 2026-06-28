'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { addDays, format } from 'date-fns';
import { th } from 'date-fns/locale';
import {
  Bell,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  ReceiptText,
  Clock,
  Coins,
  Trophy,
  Zap,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { SHIFT_ASSIGNMENT_STATUS_LABELS } from '@/lib/constants';
import { formatThaiDate, getCurrentDateStr } from '@/lib/dateUtils';
import { resolveShiftForUserDate } from '@/lib/hr';
import {
  formatThaiCurrency,
  getMilestoneReward,
  isMilestoneComplete,
  sortMilestoneTasks,
  isAttendanceTask,
} from '@/lib/taskMilestones';
import { useAuthStore } from '@/store/authStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useHrStore } from '@/store/hrStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useTaskStore } from '@/store/taskStore';

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

export default function EmployeeDashboard() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const attendanceStore = useAttendanceStore();
  const tasks = useTaskStore((state) => state.tasks);
  const templates = useTaskStore((state) => state.templates);
  const notifications = useNotificationStore((state) => state.notifications);
  const employeeRequests = useHrStore((state) => state.employeeRequests);
  const branchPolicies = useHrStore((state) => state.branchPolicies);
  const shiftAssignments = useHrStore((state) => state.shiftAssignments);

  const todayDate = getCurrentDateStr();
  
  const upcomingSchedule = useMemo(() => {
    if (!currentUser) return [];
    return Array.from({ length: 5 }, (_, index) => {
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
  }, [currentUser, shiftAssignments, branchPolicies]);

  if (!currentUser) return null;
  const todayAttendance = attendanceStore.getTodayRecordForUser(currentUser.id);
  const attendanceStatus = attendanceStore.getTodayStatus(currentUser.id);
  
  const myTasks = tasks.filter((task) => task.assigned_to === currentUser.id);
  const activeTasks = myTasks.filter((task) => ['pending', 'in_progress', 'rejected', 'overdue'].includes(task.status));
  const todayTasks = useTaskStore.getState().getTodayTasksByUser(currentUser.id);
  const milestoneTasks = sortMilestoneTasks(todayTasks);
  const completedMilestones = milestoneTasks.filter((task) => isMilestoneComplete(task.status));
  const totalMilestoneReward = milestoneTasks.reduce((sum, task) => {
    const template = task.template_id ? templates.find((item) => item.id === task.template_id) : null;
    return sum + (isMilestoneComplete(task.status) ? getMilestoneReward(task, template) : 0);
  }, 0);
  const potentialMilestoneReward = milestoneTasks.reduce((sum, task) => {
    const template = task.template_id ? templates.find((item) => item.id === task.template_id) : null;
    return sum + getMilestoneReward(task, template);
  }, 0);
  const milestoneProgress = milestoneTasks.length > 0 ? Math.round((completedMilestones.length / milestoneTasks.length) * 100) : 100;
  const myRequests = employeeRequests.filter((request) => request.user_id === currentUser.id);
  const pendingRequestsCount = myRequests.filter((request) => request.status === 'pending').length;
  const unreadNotifications = notifications.filter((n) => n.user_id === currentUser.id && !n.is_read).length;

  const todayShift = resolveShiftForUserDate({
    user: currentUser,
    workDate: todayDate,
    assignments: shiftAssignments,
    branchPolicies,
  });

  return (
    <div className="px-4 py-6 space-y-6 animate-fade-in pb-20 max-w-lg mx-auto">
      {/* Premium Hero Header */}
      <div className="relative p-6 bg-slate-900 rounded-[2.5rem] text-white shadow-2xl overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-600/20 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-600/20 rounded-full blur-2xl -ml-16 -mb-16" />
        
        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-primary-400 uppercase tracking-[0.2em] leading-none mb-1">ศุนย์ปฏิบัติงานพนักงาน</p>
              <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
                สวัสดี, {currentUser.full_name?.split(' ')[0]} <span className="animate-bounce">👋</span>
              </h1>
              <p className="text-xs text-slate-400 font-bold">{formatThaiDate(new Date().toISOString())}</p>
            </div>
            <Link href="/employee/notifications" className="relative p-2 bg-white/10 rounded-2xl hover:bg-white/20 transition-all">
              <Bell className="w-5 h-5" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-slate-900 flex items-center justify-center text-[8px] font-black">
                  {unreadNotifications}
                </span>
              )}
            </Link>
          </div>

          <div className="bg-white/5 backdrop-blur-md rounded-3xl p-4 border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-primary-500/20 rounded-lg">
                  <CalendarDays className="w-4 h-4 text-primary-400" />
                </div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">กะการทำงานวันนี้</span>
              </div>
              <Badge variant={getShiftVariant(todayShift.status)} className="bg-white/10 text-white border-none text-[9px] font-black px-2">
                {SHIFT_ASSIGNMENT_STATUS_LABELS[todayShift.status]}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-black">{todayShift.shift_name}</p>
                <p className="text-xs text-slate-400 font-bold mt-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> {todayShift.start_time} - {todayShift.end_time}
                </p>
              </div>
              <Link href="/employee/schedule">
                <div className="h-10 w-10 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Action Center - Check-in/out */}
      <Card className="p-5 border-slate-100 shadow-xl shadow-slate-200/50 rounded-[2rem]">
         <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
               <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Zap className="w-5 h-5 fill-emerald-600" />
               </div>
               <div>
                 <h2 className="font-black text-slate-900 leading-none">บันทึกเวลาทำงาน</h2>
                 <p className="text-[10px] font-black text-slate-400 uppercase mt-1 tracking-widest leading-none">สถานะการเข้างานล่าสุด</p>
               </div>
            </div>
            <Badge variant={attendanceStatus === 'not_checked_in' ? 'default' : 'success'} className="px-3 py-1 font-black uppercase text-[10px]">
               {attendanceStatus === 'not_checked_in' ? 'ออฟไลน์' : 'ออนไลน์'}
            </Badge>
         </div>

         <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 space-y-1">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">เวลาเข้างาน</p>
               <p className="text-xl font-black text-slate-900">{todayAttendance.checkIn ? new Date(todayAttendance.checkIn.created_at).toLocaleTimeString('th-TH').slice(0, 5) : '--:--'}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 space-y-1">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">เวลาออกงาน</p>
               <p className="text-xl font-black text-slate-900">{todayAttendance.checkOut ? new Date(todayAttendance.checkOut.created_at).toLocaleTimeString('th-TH').slice(0, 5) : '--:--'}</p>
            </div>
         </div>

         {attendanceStatus !== 'checked_out' && (
            <Link href="/employee/check-in">
               <Button variant="none" fullWidth className="bg-emerald-600 text-white hover:bg-emerald-700 border-none h-14 rounded-2xl shadow-lg shadow-emerald-200 text-sm font-black gap-2 transition-all active:scale-[0.98]">
                  <Camera className="w-5 h-5" />
                  {attendanceStatus === 'not_checked_in' ? 'เช็กอินเข้าทำงาน (Scan)' : 'เช็กเอาต์ออกงาน'}
               </Button>
            </Link>
         )}
      </Card>

      {/* Stats Quick Grid */}
      <div className="grid grid-cols-2 gap-4">
         <Card className="p-4 bg-white border-slate-100 shadow-sm flex items-center gap-4 rounded-3xl ring-1 ring-slate-100">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
               <ClipboardList className="w-5 h-5" />
            </div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">งานรอดำเนินการ</p>
               <p className="text-xl font-black text-slate-900 leading-none mt-1">{activeTasks.length}</p>
            </div>
         </Card>
         <Card className="p-4 bg-white border-slate-100 shadow-sm flex items-center gap-4 rounded-3xl ring-1 ring-slate-100">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
               <ReceiptText className="w-5 h-5" />
            </div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">คำขอรออนุมัติ</p>
               <p className="text-xl font-black text-slate-900 leading-none mt-1">{pendingRequestsCount}</p>
            </div>
         </Card>
      </div>

      {/* Milestone Section */}
      <div className="space-y-4">
         <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-black text-slate-900">Milestone</h2>
            <Link href="/employee/tasks" className="text-[10px] font-black text-primary-600 bg-primary-50 px-3 py-1.5 rounded-full uppercase tracking-widest">ดูทั้งหมด</Link>
         </div>

         <Card className="p-5 border-slate-100 shadow-xl shadow-emerald-100/50 rounded-[2rem] overflow-hidden relative">
            <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-100/50 rounded-full blur-3xl -mr-20 -mt-20" />
            <div className="relative z-10 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                    <Trophy className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ยอดเงินสะสมจากงาน</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{formatThaiCurrency(totalMilestoneReward)}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                      จากเป้าหมาย {formatThaiCurrency(potentialMilestoneReward)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-emerald-600">{milestoneProgress}%</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase">Progress</p>
                </div>
              </div>

              <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${milestoneProgress}%` }}
                />
              </div>

              {milestoneTasks.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-[2.5rem] border border-dashed border-slate-200">
                <div className="p-4 bg-white rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-slate-200/50">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                </div>
                <p className="text-sm font-black text-slate-900">Perfect Day!</p>
                <p className="text-xs text-slate-400 font-bold mt-1">วันนี้คุณจัดการงานเสร็จครบถ้วนแล้ว</p>
              </div>
            ) : (
              <div className="space-y-3">
              {milestoneTasks.slice(0, 4).map((task, index) => {
                const tmpl = task.template_id ? templates.find((item) => item.id === task.template_id) : null;
                const isComplete = isMilestoneComplete(task.status);
                const reward = getMilestoneReward(task, tmpl);
                return (
                  <Link key={task.id} href={!isComplete && isAttendanceTask(task, tmpl) ? '/employee/check-in' : `/employee/tasks/${task.id}`}>
                    <div className="group flex items-center gap-3 rounded-3xl border border-slate-100 bg-white p-3 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all">
                      <div className="relative flex flex-col items-center self-stretch">
                        <div className={`h-11 w-11 rounded-full flex items-center justify-center text-sm font-black shadow-sm transition-all ${
                          isComplete ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                        }`}>
                          {isComplete ? <CheckCircle2 className="w-5 h-5" /> : (isAttendanceTask(task, tmpl) ? <Clock className="w-5 h-5" /> : index + 1)}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-900 group-hover:text-emerald-700 transition-colors line-clamp-1">{task.title || tmpl?.title}</p>
                            <p className="text-[10px] font-bold text-slate-400 mt-1">กำหนด {formatThaiDate(task.due_date)}</p>
                          </div>
                          <div className={`shrink-0 rounded-2xl px-3 py-2 text-right ${
                            isComplete ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'
                          }`}>
                            <div className="flex items-center gap-1 text-xs font-black">
                              <Coins className="w-3.5 h-3.5" />
                              {formatThaiCurrency(reward)}
                            </div>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500" />
                    </div>
                  </Link>
                );
              })}
              </div>
            )}
            </div>
         </Card>
         </div>

      {/* Upcoming Shifts Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-lg font-black text-slate-900">ตารางงานถัดไป</h2>
          <Link href="/employee/schedule" className="text-[10px] font-black text-primary-600 bg-primary-50 px-3 py-1.5 rounded-full uppercase tracking-widest">ดูตารางงานทั้งหมด</Link>
        </div>
        <div className="space-y-2">
          {upcomingSchedule.slice(1).map((item) => (
            <Card key={item.workDate} className="p-4 border-slate-100 rounded-3xl shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-center w-10">
                    <p className="text-[10px] font-black text-slate-400 uppercase">{format(new Date(item.workDate), 'EEE', { locale: th })}</p>
                    <p className="text-lg font-black text-slate-900">{format(new Date(item.workDate), 'd')}</p>
                  </div>
                  <div className="h-8 border-l border-slate-100" />
                  <div>
                    <p className="text-sm font-bold text-slate-900">{item.shift.shift_name}</p>
                    <p className="text-[10px] font-bold text-slate-400">{item.shift.start_time} - {item.shift.end_time}</p>
                  </div>
                </div>
                <Badge variant={getShiftVariant(item.shift.status)} size="sm">
                  {SHIFT_ASSIGNMENT_STATUS_LABELS[item.shift.status]}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Link href="/employee/requests">
        <Card interactive className="p-5 flex items-center justify-between border-slate-100 shadow-xl shadow-slate-100/50 rounded-3xl hover:ring-2 hover:ring-amber-200 transition-all">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-amber-50 text-amber-600 rounded-2xl shadow-inner shadow-amber-200/20">
              <ReceiptText className="w-6 h-6" />
            </div>
            <div>
              <p className="font-black text-slate-900 leading-none">ศูนย์ส่งคำขอ / เบิก / ลา</p>
              <p className="text-[10px] font-black text-slate-400 uppercase mt-2 tracking-widest">ส่งคำขอ HR & การเงิน</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300" />
        </Card>
      </Link>
    </div>
  );
}
