'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { addDays, format } from 'date-fns';
import { th } from 'date-fns/locale';
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Coins,
  ReceiptText,
  Trophy,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Page, PageHeader, PageSection, StatTile } from '@/components/ui/Page';
import { SHIFT_ASSIGNMENT_STATUS_LABELS } from '@/lib/constants';
import { formatThaiDate, getCurrentDateStr } from '@/lib/dateUtils';
import { resolveShiftForUserDate } from '@/lib/hr';
import {
  formatThaiCurrency,
  getMilestoneReward,
  isAttendanceTask,
  isMilestoneComplete,
  sortMilestoneTasks,
} from '@/lib/taskMilestones';
import { useAuthStore } from '@/store/authStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useHrStore } from '@/store/hrStore';
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

function formatAttendanceTime(record?: { created_at: string }) {
  return record
    ? new Date(record.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    : '--:--';
}

export default function EmployeeDashboard() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const attendanceStore = useAttendanceStore();
  const tasks = useTaskStore((state) => state.tasks);
  const templates = useTaskStore((state) => state.templates);
  const employeeRequests = useHrStore((state) => state.employeeRequests);
  const branchPolicies = useHrStore((state) => state.branchPolicies);
  const shiftAssignments = useHrStore((state) => state.shiftAssignments);

  const todayDate = getCurrentDateStr();
  const templateById = useMemo(() => {
    return new Map(templates.map((template) => [template.id, template]));
  }, [templates]);
  const getTaskTemplate = (templateId?: string) => templateId ? templateById.get(templateId) : null;

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
  const milestoneTasks = sortMilestoneTasks(todayTasks, (task) => getTaskTemplate(task.template_id));
  const completedMilestones = milestoneTasks.filter((task) => isMilestoneComplete(task.status));
  const totalMilestoneReward = milestoneTasks.reduce((sum, task) => {
    const template = getTaskTemplate(task.template_id);
    return sum + (isMilestoneComplete(task.status) ? getMilestoneReward(task, template) : 0);
  }, 0);
  const potentialMilestoneReward = milestoneTasks.reduce((sum, task) => {
    const template = getTaskTemplate(task.template_id);
    return sum + getMilestoneReward(task, template);
  }, 0);
  const milestoneProgress = milestoneTasks.length > 0
    ? Math.round((completedMilestones.length / milestoneTasks.length) * 100)
    : 100;
  const myRequests = employeeRequests.filter((request) => request.user_id === currentUser.id);
  const pendingRequestsCount = myRequests.filter((request) => request.status === 'pending').length;
  const todayShift = resolveShiftForUserDate({
    user: currentUser,
    workDate: todayDate,
    assignments: shiftAssignments,
    branchPolicies,
  });
  const firstName = currentUser.full_name?.split(' ')[0] || 'พนักงาน';

  return (
    <Page maxWidth="sm" className="space-y-5 pb-24">
      <PageHeader
        eyebrow={formatThaiDate(new Date().toISOString())}
        title={`สวัสดี, ${firstName}`}
        description="ดูงานวันนี้ ลงเวลา และติดตามรายได้ปัจจุบันของคุณ"
      />

      <Card className="border-emerald-100 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">{todayShift.shift_name}</p>
            <p className="mt-1 text-sm text-slate-500">{todayShift.start_time} - {todayShift.end_time}</p>
          </div>
          <Badge variant={getShiftVariant(todayShift.status)}>
            {SHIFT_ASSIGNMENT_STATUS_LABELS[todayShift.status]}
          </Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">เวลาเข้า</p>
            <p className="mt-1 text-lg font-bold text-slate-950">{formatAttendanceTime(todayAttendance.checkIn)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">เวลาออก</p>
            <p className="mt-1 text-lg font-bold text-slate-950">{formatAttendanceTime(todayAttendance.checkOut)}</p>
          </div>
        </div>
      </Card>

      {attendanceStatus !== 'checked_out' && (
        <Link href="/employee/check-in" className="block">
          <Button fullWidth size="lg" icon={<Camera className="h-5 w-5" />}>
            {attendanceStatus === 'not_checked_in' ? 'เช็คอินเข้างาน' : 'เช็คเอาท์ออกงาน'}
          </Button>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="งานรอดำเนินการ"
          value={activeTasks.length}
          icon={<ClipboardList className="h-5 w-5" />}
          tone="blue"
        />
        <StatTile
          label="คำขอรออนุมัติ"
          value={pendingRequestsCount}
          icon={<ReceiptText className="h-5 w-5" />}
          tone="amber"
        />
      </div>

      <PageSection
        title="Milestone"
        action={(
          <Link href="/employee/tasks">
            <Button variant="ghost" size="sm">ดูทั้งหมด</Button>
          </Link>
        )}
      >
        <Card className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Trophy className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">ยอดเงินสะสมจากงาน</p>
                  <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
                    {formatThaiCurrency(totalMilestoneReward)}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                จากเป้าหมาย {formatThaiCurrency(potentialMilestoneReward)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-emerald-600">{milestoneProgress}%</p>
              <p className="text-xs font-medium text-slate-400">Progress</p>
            </div>
          </div>

          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${milestoneProgress}%` }}
            />
          </div>

          {milestoneTasks.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <p className="mt-2 text-sm font-semibold text-slate-950">วันนี้ยังไม่มีงานใน Milestone</p>
              <p className="mt-1 text-xs text-slate-500">เมื่อมีงานใหม่ ระบบจะแสดงรายการที่นี่</p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {milestoneTasks.slice(0, 4).map((task, index) => {
                const template = getTaskTemplate(task.template_id);
                const isComplete = isMilestoneComplete(task.status);
                const reward = getMilestoneReward(task, template);
                const href = !isComplete && isAttendanceTask(task, template)
                  ? '/employee/check-in'
                  : `/employee/tasks/${task.id}`;

                return (
                  <Link key={task.id} href={href} className="block">
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-emerald-200 hover:bg-emerald-50/40">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                        isComplete ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {isComplete ? <CheckCircle2 className="h-5 w-5" /> : (isAttendanceTask(task, template) ? <Clock className="h-5 w-5" /> : index + 1)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-950">{task.title || template?.title}</p>
                        <p className="mt-1 text-xs text-slate-500">กำหนด {formatThaiDate(task.due_date)}</p>
                      </div>
                      <div className={`shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-semibold ${
                        isComplete ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'
                      }`}>
                        <span className="inline-flex items-center gap-1">
                          <Coins className="h-3.5 w-3.5" />
                          {formatThaiCurrency(reward)}
                        </span>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </PageSection>

      <PageSection
        title="ตารางงานถัดไป"
        action={(
          <Link href="/employee/schedule">
            <Button variant="ghost" size="sm">ดูตาราง</Button>
          </Link>
        )}
      >
        <div className="space-y-2">
          {upcomingSchedule.slice(1).map((item) => (
            <Card key={item.workDate} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="w-10 shrink-0 text-center">
                    <p className="text-xs font-semibold text-slate-400">{format(new Date(item.workDate), 'EEE', { locale: th })}</p>
                    <p className="text-lg font-bold text-slate-950">{format(new Date(item.workDate), 'd')}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{item.shift.shift_name}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.shift.start_time} - {item.shift.end_time}</p>
                  </div>
                </div>
                <Badge variant={getShiftVariant(item.shift.status)} size="sm">
                  {SHIFT_ASSIGNMENT_STATUS_LABELS[item.shift.status]}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      </PageSection>

      <Link href="/employee/requests" className="block">
        <Card interactive className="flex items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <ReceiptText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">คำขอ / เบิก / ลา</p>
              <p className="mt-1 text-xs text-slate-500">ส่งคำขอ HR และรายการการเงิน</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        </Card>
      </Link>
    </Page>
  );
}
