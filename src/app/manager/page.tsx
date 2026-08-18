'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  CalendarCheck,
  CheckSquare,
  FileSpreadsheet,
  Plus,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Page, PageHeader, PageSection, StatTile } from '@/components/ui/Page';
import { formatThaiDate } from '@/lib/dateUtils';
import { getPendingReviewSubmissionsForUser } from '@/lib/reviewHelpers';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useHrStore } from '@/store/hrStore';
import { useTaskStore } from '@/store/taskStore';
import { EMPLOYEE_REQUEST_TYPE_LABELS } from '@/lib/constants';

export default function ManagerDashboard() {
  const { currentUser } = useAuthStore();
  const taskStore = useTaskStore();
  const attendanceStore = useAttendanceStore();
  const employeeStore = useEmployeeStore();
  const branchStore = useBranchStore();
  const { employeeRequests } = useHrStore();

  const dashboardData = useMemo(() => {
    if (!currentUser) {
      return {
        submissions: [],
        pendingRequests: [],
        activeStaff: [],
        branchEmployees: [],
        overdueCount: 0,
        todayRecordsCount: 0,
      };
    }

    const employees = employeeStore.getEmployees();
    const submissions = getPendingReviewSubmissionsForUser(taskStore.submissions, currentUser, employees);
    const pendingRequests = employeeRequests.filter((request) =>
      request.status === 'pending' && (!currentUser.branch_id || request.branch_id === currentUser.branch_id)
    );
    const activeBranchId = currentUser.branch_id || branchStore.branches[0]?.id;
    const branchEmployees = employees.filter((user) => user.branch_id === activeBranchId);
    const todayRecords = attendanceStore.getAllTodayRecords();
    const activeStaff = todayRecords.filter((record) => (
      record.type === 'check_in' &&
      !todayRecords.find((item) => item.user_id === record.user_id && item.type === 'check_out')
    ));

    return {
      submissions,
      pendingRequests,
      activeStaff,
      branchEmployees,
      overdueCount: taskStore.getTaskStats().overdue,
      todayRecordsCount: todayRecords.length,
    };
  }, [attendanceStore, branchStore.branches, currentUser, employeeRequests, employeeStore, taskStore]);

  if (!currentUser) return null;

  const reviewQueue = dashboardData.submissions.slice(0, 5).map((submission) => {
    const employee = employeeStore.getUserById(submission.submitted_by);
    const task = taskStore.getTaskById(submission.task_id);
    const template = task?.template_id ? taskStore.getTemplateById(task.template_id) : null;

    return {
      id: submission.id,
      href: '/manager/review',
      title: task?.title || template?.title || 'งานที่ส่งตรวจ',
      description: employee?.full_name || 'ไม่ระบุพนักงาน',
      meta: formatThaiDate(submission.submitted_at),
      badge: 'งาน',
    };
  });

  const requestQueue = dashboardData.pendingRequests.slice(0, 5).map((request) => {
    const employee = employeeStore.getUserById(request.user_id);

    return {
      id: request.id,
      href: '/manager/requests',
      title: request.title,
      description: employee?.full_name || 'ไม่ระบุพนักงาน',
      meta: EMPLOYEE_REQUEST_TYPE_LABELS[request.request_type],
      badge: 'คำขอ',
    };
  });

  const decisionQueue = [...reviewQueue, ...requestQueue].slice(0, 6);

  return (
    <Page maxWidth="xl" className="space-y-6">
      <PageHeader
        eyebrow={formatThaiDate(new Date().toISOString())}
        title="แดชบอร์ดผู้จัดการ"
        description="รายการที่ต้องตรวจสอบวันนี้และสถานะทีมปัจจุบัน"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="รอตรวจ"
          value={dashboardData.submissions.length + dashboardData.pendingRequests.length}
          icon={<CheckSquare className="h-5 w-5" />}
          tone="amber"
        />
        <StatTile
          label="กำลังทำงาน"
          value={dashboardData.activeStaff.length}
          helper={`${dashboardData.branchEmployees.length} คนในสาขา`}
          icon={<Activity className="h-5 w-5" />}
          tone="green"
        />
        <StatTile
          label="ลงเวลาวันนี้"
          value={dashboardData.todayRecordsCount}
          icon={<ShieldCheck className="h-5 w-5" />}
          tone="blue"
        />
        <StatTile
          label="เกินกำหนด"
          value={dashboardData.overdueCount}
          icon={<ShieldAlert className="h-5 w-5" />}
          tone="red"
        />
      </div>

      <PageSection
        title="คิวรอตรวจ"
        description="งานและคำขอที่ต้องตัดสินใจ"
        action={<Link href="/manager/review"><Button variant="outline" size="sm">ดูทั้งหมด</Button></Link>}
      >
        {decisionQueue.length === 0 ? (
          <Card className="p-8 text-center">
            <CheckSquare className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-500">ไม่มีรายการรอตรวจ</p>
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {decisionQueue.map((item) => (
              <Link key={item.id} href={item.href} className="block">
                <Card interactive className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={item.badge === 'งาน' ? 'warning' : 'info'}>{item.badge}</Badge>
                      <span className="text-xs text-slate-500">{item.meta}</span>
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold text-slate-950">{item.title}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{item.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </PageSection>

      <PageSection title="ทางลัด">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'มอบหมายงาน', href: '/manager/assignments', icon: Plus },
            { label: 'จัดตารางกะ', href: '/manager/schedule', icon: CalendarCheck },
            { label: 'เพิ่มพนักงาน', href: '/manager/employees', icon: UserPlus },
            { label: 'ค่าแรง', href: '/manager/payroll', icon: FileSpreadsheet },
          ].map((action) => (
            <Link key={action.href} href={action.href} className="block">
              <Card interactive className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800">
                  <action.icon className="h-5 w-5" />
                </div>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950">{action.label}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              </Card>
            </Link>
          ))}
        </div>
      </PageSection>

      <PageSection title="คำขอพนักงาน">
        <Link href="/manager/requests" className="block">
          <Card interactive className="flex items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <ReceiptText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">คำขออนุมัติ</p>
                <p className="mt-1 text-xs text-slate-500">{dashboardData.pendingRequests.length} รายการรอตรวจ</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
          </Card>
        </Link>
      </PageSection>
    </Page>
  );
}
