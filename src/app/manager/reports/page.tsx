'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarCheck,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  ReceiptText,
  Users,
  UserMinus,
  WalletCards,
  Zap,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useAuthStore } from '@/store/authStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useBranchStore } from '@/store/branchStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useHrStore } from '@/store/hrStore';
import { useTaskStore } from '@/store/taskStore';
import { exportToCSV, exportToExcel } from '@/lib/export';
import {
  buildPayrollSummary,
  formatMinutesAsHours,
  getMonthDateRange,
} from '@/lib/hr';
import { EMPLOYEE_REQUEST_TYPE_LABELS } from '@/lib/constants';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(value || 0);
}

export default function ReportsPage() {
  const { currentUser } = useAuthStore();
  const attendanceRecords = useAttendanceStore((state) => state.records);
  const branches = useBranchStore((state) => state.branches);
  const getBranchById = useBranchStore((state) => state.getBranchById);
  const users = useEmployeeStore((state) => state.users);
  const tasks = useTaskStore((state) => state.tasks);
  const getTaskById = useTaskStore((state) => state.getTaskById);
  const submissions = useTaskStore((state) => state.submissions);
  const {
    branchPolicies,
    compensationProfiles,
    employeeRequests,
    schemaMessage,
    schemaReady,
    shiftAssignments,
  } = useHrStore();

  const monthRange = getMonthDateRange(new Date());
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [rangeStart, setRangeStart] = useState(monthRange.start);
  const [rangeEnd, setRangeEnd] = useState(monthRange.end);

  const activeBranchId = selectedBranchId || currentUser?.branch_id || branches[0]?.id || '';

  const branchEmployees = useMemo(() => {
    return users.filter((user) => {
      if (user.role !== 'employee') {
        return false;
      }

      if (currentUser?.role === 'manager') {
        return user.branch_id === currentUser.branch_id;
      }

      return !activeBranchId || user.branch_id === activeBranchId;
    });
  }, [activeBranchId, currentUser, users]);

  const payrollRows = useMemo(() => {
    return branchEmployees.map((employee) => {
      const payrollSummary = buildPayrollSummary({
        user: employee,
        startDate: rangeStart,
        endDate: rangeEnd,
        records: attendanceRecords.filter((record) => record.user_id === employee.id),
        assignments: shiftAssignments,
        branchPolicies,
        requests: employeeRequests.filter((request) => request.user_id === employee.id && request.request_type === 'leave' && request.status === 'approved'),
        compensationProfile: compensationProfiles.find((profile) => profile.user_id === employee.id),
      });

      return {
        employee,
        branch: getBranchById(employee.branch_id),
        payrollSummary,
      };
    });
  }, [attendanceRecords, branchEmployees, branchPolicies, compensationProfiles, employeeRequests, getBranchById, rangeEnd, rangeStart, shiftAssignments]);

  const summary = useMemo(() => ({
    employees: payrollRows.length,
    scheduledDays: payrollRows.reduce((sum, row) => sum + row.payrollSummary.scheduled_days, 0),
    lateDays: payrollRows.reduce((sum, row) => sum + row.payrollSummary.late_days, 0),
    absentDays: payrollRows.reduce((sum, row) => sum + row.payrollSummary.absent_days, 0),
    otMinutes: payrollRows.reduce((sum, row) => sum + row.payrollSummary.total_ot_minutes, 0),
    netPay: payrollRows.reduce((sum, row) => sum + row.payrollSummary.net_pay, 0),
  }), [payrollRows]);

  const requestSummary = useMemo(() => {
    const scopedRequests = employeeRequests.filter((request) => {
      if (currentUser?.role === 'manager') {
        return request.branch_id === currentUser.branch_id;
      }

      return !activeBranchId || request.branch_id === activeBranchId;
    });

    return {
      leave: scopedRequests.filter((request) => request.request_type === 'leave').length,
      advance: scopedRequests.filter((request) => request.request_type === 'advance').length,
      expense: scopedRequests.filter((request) => request.request_type === 'expense').length,
      pending: scopedRequests.filter((request) => request.status === 'pending').length,
    };
  }, [activeBranchId, currentUser, employeeRequests]);

  const taskSummary = useMemo(() => {
    const employeeIds = new Set(branchEmployees.map((employee) => employee.id));
    const scopedTasks = tasks.filter((task) => employeeIds.has(task.assigned_to));
    const scopedSubmissions = submissions.filter((submission) => {
      const task = getTaskById(submission.task_id);
      return Boolean(task && employeeIds.has(task.assigned_to));
    });

    return {
      total: scopedTasks.length,
      approved: scopedTasks.filter((task) => task.status === 'approved').length,
      pending: scopedTasks.filter((task) => task.status === 'pending' || task.status === 'in_progress').length,
      submitted: scopedSubmissions.filter((submission) => submission.review_status === 'pending').length,
    };
  }, [branchEmployees, getTaskById, submissions, tasks]);

  const payrollChartData = useMemo(() => {
    return payrollRows
      .map((row) => ({
        name: row.employee.full_name.split(' ')[0],
        netPay: Number(row.payrollSummary.net_pay.toFixed(2)),
        otHours: Number((row.payrollSummary.total_ot_minutes / 60).toFixed(2)),
      }))
      .sort((left, right) => right.netPay - left.netPay)
      .slice(0, 8);
  }, [payrollRows]);

  const requestPieData = useMemo(() => ([
    { name: EMPLOYEE_REQUEST_TYPE_LABELS.leave, value: requestSummary.leave, color: '#0f766e' },
    { name: EMPLOYEE_REQUEST_TYPE_LABELS.advance, value: requestSummary.advance, color: '#f59e0b' },
    { name: EMPLOYEE_REQUEST_TYPE_LABELS.expense, value: requestSummary.expense, color: '#3b82f6' },
  ].filter((item) => item.value > 0)), [requestSummary.advance, requestSummary.expense, requestSummary.leave]);

  const handleExportAttendanceSummary = () => {
    const rows = payrollRows.map((row) => ({
      พนักงาน: row.employee.full_name,
      สาขา: row.branch?.name || '-',
      จำนวนกะ: row.payrollSummary.scheduled_days,
      วันทำงานจริง: row.payrollSummary.worked_days,
      วันมาสาย: row.payrollSummary.late_days,
      นาทีสายรวม: row.payrollSummary.total_late_minutes,
      วันขาด: row.payrollSummary.absent_days,
      วันลา: row.payrollSummary.leave_days,
      ชั่วโมงทำงานรวม: formatMinutesAsHours(row.payrollSummary.total_worked_minutes),
      ชั่วโมงโอทีรวม: formatMinutesAsHours(row.payrollSummary.total_ot_minutes),
    }));

    exportToExcel(rows, `attendance-range-${rangeStart}-to-${rangeEnd}`, 'AttendanceSummary');
  };

  const handleExportPayrollSummary = () => {
    const rows = payrollRows.map((row) => ({
      พนักงาน: row.employee.full_name,
      สาขา: row.branch?.name || '-',
      ประเภทค่าจ้าง: compensationProfiles.find((profile) => profile.user_id === row.employee.id)?.pay_type || 'daily',
      ค่าจ้างก่อนหัก: row.payrollSummary.gross_pay,
      โอทีเพิ่ม: row.payrollSummary.ot_pay,
      หักสาย: row.payrollSummary.late_deduction,
      หักขาด: row.payrollSummary.absence_deduction,
      หักลา: row.payrollSummary.leave_deduction,
      รับสุทธิ: row.payrollSummary.net_pay,
    }));

    exportToExcel(rows, `payroll-range-${rangeStart}-to-${rangeEnd}`, 'PayrollSummary');
  };

  const handleExportRequests = () => {
    const rows = employeeRequests
      .filter((request) => {
        if (currentUser?.role === 'manager') {
          return request.branch_id === currentUser.branch_id;
        }

        return !activeBranchId || request.branch_id === activeBranchId;
      })
      .map((request) => {
        const employee = users.find((user) => user.id === request.user_id);

        return {
          ประเภทคำขอ: EMPLOYEE_REQUEST_TYPE_LABELS[request.request_type],
          พนักงาน: employee?.full_name || '-',
          สาขา: getBranchById(request.branch_id || '')?.name || '-',
          หัวข้อ: request.title,
          จำนวนเงิน: request.amount ?? '',
          วันที่เริ่ม: request.start_date || '',
          วันที่สิ้นสุด: request.end_date || '',
          สถานะ: request.status,
          ส่งเมื่อ: new Date(request.created_at).toLocaleString('th-TH'),
        };
      });

    exportToCSV(rows, `employee-requests-${rangeStart}-to-${rangeEnd}`);
  };

  const handleExportTasks = () => {
    const employeeIds = new Set(branchEmployees.map((employee) => employee.id));
    const rows = tasks
      .filter((task) => employeeIds.has(task.assigned_to))
      .map((task) => {
        const employee = users.find((user) => user.id === task.assigned_to);

        return {
          งาน: task.title || '-',
          พนักงาน: employee?.full_name || '-',
          สาขา: getBranchById(employee?.branch_id || '')?.name || '-',
          กำหนดส่ง: task.due_date,
          สถานะ: task.status,
        };
      });

    exportToCSV(rows, `task-summary-${rangeStart}-to-${rangeEnd}`);
  };

  const setQuickRange = (type: 'thisMonth' | 'lastMonth' | 'last30') => {
    const today = new Date();
    if (type === 'thisMonth') {
      const range = getMonthDateRange(today);
      setRangeStart(range.start);
      setRangeEnd(range.end);
    } else if (type === 'lastMonth') {
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const range = getMonthDateRange(lastMonth);
      setRangeStart(range.start);
      setRangeEnd(range.end);
    } else if (type === 'last30') {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      setRangeStart(start.toISOString().split('T')[0]);
      setRangeEnd(end.toISOString().split('T')[0]);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-primary-50 flex items-center justify-center text-primary-600">
            <BarChart3 className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 leading-none">รายงานและวิเคราะห์ผล</h1>
            <p className="text-sm text-slate-500 mt-2">ภาพรวม Attendance, Payroll และคำขอต่างๆ ของพนักงาน</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setQuickRange('thisMonth')}>เดือนนี้</Button>
          <Button variant="ghost" size="sm" onClick={() => setQuickRange('lastMonth')}>เดือนที่แล้ว</Button>
          <Button variant="ghost" size="sm" onClick={() => setQuickRange('last30')}>30 วันล่าสุด</Button>
        </div>
      </div>

      {!schemaReady && (
        <Card statusColor="amber" className="bg-amber-50/70 border-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">ยังไม่พบข้อมูล HR ในระบบ</p>
              <p className="text-xs text-amber-800 mt-1">{schemaMessage}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Control Bar */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-2 flex flex-col md:flex-row gap-2">
        <div className="flex-1">
          <Select
            className="border-none bg-slate-50 hover:bg-slate-100 transition-colors rounded-2xl h-full"
            value={activeBranchId}
            onChange={(event) => setSelectedBranchId(event.target.value)}
            options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
            disabled={currentUser?.role === 'manager'}
          />
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2 bg-slate-50 rounded-2xl p-2 md:pr-4">
          <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-1.5 border border-slate-200">
            <CalendarRange className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              className="text-sm font-bold bg-transparent focus:outline-none"
            />
            <span className="text-slate-300 font-bold px-1">ถึง</span>
            <input
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              className="text-sm font-bold bg-transparent focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'พนักงานในรายงาน', value: summary.employees, icon: Users, color: 'slate', unit: 'คน' },
          { label: 'จำนวนกะทั้งหมด', value: summary.scheduledDays, icon: CalendarCheck, color: 'indigo', unit: 'กะ' },
          { label: 'จำนวนวันมาสาย', value: summary.lateDays, icon: Clock3, color: 'amber', unit: 'ครั้ง' },
          { label: 'จำนวนวันขาดงาน', value: summary.absentDays, icon: UserMinus, color: 'red', unit: 'ครั้ง' },
          { label: 'ชั่วโมงโอทีรวม', value: formatMinutesAsHours(summary.otMinutes), icon: Zap, color: 'emerald', unit: 'ชม.' },
          { label: 'ยอดรับสุทธิรวม', value: formatCurrency(summary.netPay), icon: Banknote, color: 'blue', unit: '' },
        ].map((stat) => (
          <Card key={stat.label} className="group hover:border-slate-300 transition-all">
            <div className={`h-10 w-10 mb-3 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110
              ${stat.color === 'slate' ? 'bg-slate-100 text-slate-600' : ''}
              ${stat.color === 'indigo' ? 'bg-indigo-50 text-indigo-600' : ''}
              ${stat.color === 'amber' ? 'bg-amber-50 text-amber-600' : ''}
              ${stat.color === 'red' ? 'bg-red-50 text-red-600' : ''}
              ${stat.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' : ''}
              ${stat.color === 'blue' ? 'bg-blue-50 text-blue-600' : ''}
            `}>
              <stat.icon className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
            <div className="flex items-baseline gap-1 mt-1">
              <p className="text-xl font-black text-slate-900">{stat.value}</p>
              {stat.unit && <span className="text-[10px] font-bold text-slate-400">{stat.unit}</span>}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2 shadow-sm border-slate-200">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary-100 flex items-center justify-center text-primary-700">
                <WalletCards className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">วิเคราะห์รายได้พนักงาน</h2>
                <p className="text-xs text-slate-500 mt-1">เปรียบเทียบรับสุทธิของพนักงานที่มีรายได้สูงสุด 8 อันดับ</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase">เฉลี่ยต่อคน</p>
              <p className="text-lg font-black text-primary-700">
                {formatCurrency(summary.netPay / (summary.employees || 1))}
              </p>
            </div>
          </div>
          
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={payrollChartData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f766e" stopOpacity={1} />
                    <stop offset="100%" stopColor="#0f766e" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} dy={10} />
                <YAxis hide />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800">
                          <p className="text-xs font-bold text-slate-400 mb-1">{payload[0].payload.name}</p>
                          <p className="text-sm font-black">{formatCurrency(Number(payload[0].value))}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="netPay" fill="url(#barGradient)" radius={[6, 6, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
              <ReceiptText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">สัดส่วนประเภทคำขอ</h2>
              <p className="text-xs text-slate-500 mt-1">การลางาน เบิกเงิน และค่าใช้จ่าย</p>
            </div>
          </div>

          <div className="h-56 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={requestPieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={65}
                  outerRadius={85}
                  paddingAngle={8}
                >
                  {requestPieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white p-2 rounded-lg shadow-lg border border-slate-100">
                          <p className="text-xs font-bold text-slate-900">{payload[0].name}: {payload[0].value} รายการ</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-3xl font-black text-slate-900">{requestSummary.leave + requestSummary.advance + requestSummary.expense}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase">รวมคำขอทั้งหมด</p>
            </div>
          </div>

          <div className="space-y-2 mt-6">
            {requestPieData.length === 0 ? (
              <div className="text-center py-4 bg-slate-50 rounded-2xl">
                <p className="text-sm text-slate-400">ยังไม่มีข้อมูลคำขอในปีนี้</p>
              </div>
            ) : requestPieData.map((item) => (
              <div key={item.name} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs font-bold text-slate-600">{item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-900">{item.value}</span>
                  <span className="text-[10px] font-bold text-slate-400">รายการ</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-bold text-slate-900">ศูนย์ส่งออกข้อมูล (Export Center)</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Attendance Summary', desc: 'สรุปกะ, สาย, ขาด และโอที', icon: FileSpreadsheet, color: 'emerald', action: handleExportAttendanceSummary, type: 'Excel' },
            { label: 'Payroll Summary', desc: 'ค่าจ้างก่อนหัก, โอที และรับสุทธิ', icon: WalletCards, color: 'blue', action: handleExportPayrollSummary, type: 'Excel' },
            { label: 'Employee Requests', desc: 'รายการลา, เบิกเงิน และค่าใช้จ่าย', icon: ReceiptText, color: 'amber', action: handleExportRequests, type: 'CSV' },
            { label: 'Task Summary', desc: 'ภาพรวมงานของพนักงานในสาขา', icon: FileText, color: 'slate', action: handleExportTasks, type: 'CSV' },
          ].map((item) => (
            <Card key={item.label} className="group flex flex-col justify-between hover:border-primary-200 transition-all border-dashed">
              <div className="flex items-start gap-3">
                <div className={`p-3 rounded-2xl
                  ${item.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' : ''}
                  ${item.color === 'blue' ? 'bg-blue-50 text-blue-600' : ''}
                  ${item.color === 'amber' ? 'bg-amber-50 text-amber-600' : ''}
                  ${item.color === 'slate' ? 'bg-slate-100 text-slate-600' : ''}
                `}>
                  <item.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-sm">{item.label}</p>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                fullWidth
                className="mt-4 group-hover:bg-primary-50 group-hover:text-primary-700 group-hover:border-primary-200"
                icon={<Download className="w-3 h-3" />}
                onClick={item.action}
              >
                ดาวน์โหลด {item.type}
              </Button>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <CalendarRange className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-bold text-slate-900">สรุปคำขอและงานที่รอตรวจ</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: 'คำขอรออนุมัติ', value: requestSummary.pending, color: 'amber' },
              { label: 'งานรอตรวจ', value: taskSummary.submitted, color: 'emerald' },
              { label: 'งานทั้งหมด', value: taskSummary.total, color: 'indigo' },
              { label: 'งานอนุมัติแล้ว', value: taskSummary.approved, color: 'slate' },
            ].map((box) => (
              <div key={box.label} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{box.label}</p>
                <p className={`text-2xl font-black mt-1 ${
                  box.color === 'amber' ? 'text-amber-600' : 
                  box.color === 'emerald' ? 'text-emerald-600' : 
                  box.color === 'indigo' ? 'text-indigo-600' : 'text-slate-900'
                }`}>{box.value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-bold text-slate-900">ชั่วโมงโอทีรายคน</h2>
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase">สูงสุด 8 อันดับ</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={payrollChartData} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} width={80} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-slate-900 text-white p-2 rounded-lg shadow-lg border border-slate-800 text-[10px]">
                          {payload[0].value} ชั่วโมง
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="otHours" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
