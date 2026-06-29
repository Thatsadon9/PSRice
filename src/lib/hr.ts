import {
  addDays,
  differenceInMinutes,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
} from 'date-fns';
import type {
  AttendanceRecord,
  BranchAttendancePolicy,
  CompensationProfile,
  EmployeeRequest,
  ShiftAssignment,
  ShiftAssignmentStatus,
  Task,
  TaskTemplate,
  User,
} from '@/lib/types';
import { getMilestoneReward, isAttendanceTask } from '@/lib/taskMilestones';

const DEFAULT_SHIFT_START = '08:30';
const DEFAULT_SHIFT_END = '17:30';
const DEFAULT_BREAK_MINUTES = 60;
const DEFAULT_GRACE_MINUTES = 15;
const DEFAULT_EARLY_OUT_GRACE_MINUTES = 0;
const DEFAULT_MINIMUM_OT_MINUTES = 30;

export interface ResolvedShiftConfig {
  branch_id?: string | null;
  shift_template_id?: string | null;
  work_date: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  late_grace_minutes: number;
  early_out_grace_minutes: number;
  minimum_ot_minutes: number;
  status: ShiftAssignmentStatus;
  source: 'assignment' | 'branch_policy' | 'fallback';
}

export interface AttendancePair {
  checkIn?: AttendanceRecord;
  checkOut?: AttendanceRecord;
}

export interface DailyAttendanceSummary {
  work_date: string;
  status: ShiftAssignmentStatus | 'worked' | 'absent' | 'unscheduled';
  source: ResolvedShiftConfig['source'];
  scheduled: boolean;
  leave_day: boolean;
  absent: boolean;
  has_check_in: boolean;
  has_check_out: boolean;
  checkIn?: AttendanceRecord;
  checkOut?: AttendanceRecord;
  shift?: ResolvedShiftConfig;
  worked_minutes: number;
  scheduled_minutes: number;
  late_minutes: number;
  early_out_minutes: number;
  ot_minutes: number;
}

export interface PayrollSummary {
  user_id: string;
  start_date: string;
  end_date: string;
  scheduled_days: number;
  worked_days: number;
  leave_days: number;
  absent_days: number;
  late_days: number;
  total_late_minutes: number;
  early_out_days: number;
  total_early_out_minutes: number;
  total_ot_minutes: number;
  total_worked_minutes: number;
  gross_pay: number;
  ot_pay: number;
  task_reward: number;
  attendance_reward: number;
  expense_reimbursement: number;
  late_deduction: number;
  absence_deduction: number;
  leave_deduction: number;
  advance_deduction: number;
  manual_bonus: number;
  manual_deduction: number;
  total_earnings: number;
  total_deductions: number;
  net_pay: number;
  money_lines: PayrollMoneyLine[];
  daily_summaries: DailyAttendanceSummary[];
}

export interface PayrollMoneyLine {
  id: string;
  label: string;
  amount: number;
  kind: 'earning' | 'deduction';
  source: 'base' | 'ot' | 'task' | 'attendance' | 'expense' | 'late' | 'absence' | 'leave' | 'advance' | 'manual';
}

export function normalizeTimeValue(timeValue?: string | null): string {
  if (!timeValue) {
    return '00:00';
  }

  const value = timeValue.trim();
  if (value.length >= 5) {
    return value.slice(0, 5);
  }

  return value;
}

export function toNumberValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export function timeToMinutes(timeValue?: string | null): number {
  const [hours = 0, minutes = 0] = normalizeTimeValue(timeValue).split(':').map(Number);
  return (hours * 60) + minutes;
}

export function createLocalDateTime(dateValue: string, timeValue?: string | null): Date {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hours = 0, minutes = 0] = normalizeTimeValue(timeValue).split(':').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hours, minutes, 0, 0);
}

export function formatMinutesAsHours(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (hours === 0) {
    return `${minutes} นาที`;
  }

  return `${hours} ชม. ${minutes} นาที`;
}

export function getMonthDateRange(monthDate = new Date()) {
  return {
    start: format(startOfMonth(monthDate), 'yyyy-MM-dd'),
    end: format(endOfMonth(monthDate), 'yyyy-MM-dd'),
  };
}

function getShiftInterval(shift: ResolvedShiftConfig) {
  const start = createLocalDateTime(shift.work_date, shift.start_time);
  let end = createLocalDateTime(shift.work_date, shift.end_time);

  if (timeToMinutes(shift.end_time) <= timeToMinutes(shift.start_time)) {
    end = addDays(end, 1);
  }

  return { start, end };
}

function formatRecordDate(record: AttendanceRecord) {
  return format(parseISO(record.created_at), 'yyyy-MM-dd');
}

function formatRecordLikeDate(dateValue?: string | null) {
  if (!dateValue) {
    return '';
  }

  try {
    return format(parseISO(dateValue), 'yyyy-MM-dd');
  } catch {
    return dateValue.slice(0, 10);
  }
}

function isDateWithinInclusiveRange(dateValue: string, startDate: string, endDate: string) {
  return dateValue >= startDate && dateValue <= endDate;
}

function sumMoneyRequests(params: {
  requests: EmployeeRequest[];
  userId: string;
  requestType: 'advance' | 'expense';
  startDate: string;
  endDate: string;
}) {
  const { requests, userId, requestType, startDate, endDate } = params;

  return requests.reduce((sum, request) => {
    if (request.user_id !== userId || request.request_type !== requestType || request.status !== 'approved') {
      return sum;
    }

    const effectiveDate = formatRecordLikeDate(request.reviewed_at || request.created_at);
    if (!isDateWithinInclusiveRange(effectiveDate, startDate, endDate)) {
      return sum;
    }

    return sum + Math.max(0, toNumberValue(request.amount, 0));
  }, 0);
}

function buildPayrollMoneyLines(params: {
  grossPay: number;
  otPay: number;
  taskReward: number;
  attendanceReward: number;
  expenseReimbursement: number;
  lateDeduction: number;
  absenceDeduction: number;
  leaveDeduction: number;
  advanceDeduction: number;
  manualBonus: number;
  manualDeduction: number;
}) {
  const rows: PayrollMoneyLine[] = [
    { id: 'gross-pay', label: 'ค่าจ้างพื้นฐาน', amount: params.grossPay, kind: 'earning', source: 'base' },
    { id: 'ot-pay', label: 'ค่าล่วงเวลา', amount: params.otPay, kind: 'earning', source: 'ot' },
    { id: 'attendance-reward', label: 'โบนัสเช็คอิน', amount: params.attendanceReward, kind: 'earning', source: 'attendance' },
    { id: 'task-reward', label: 'โบนัสงานที่อนุมัติ', amount: params.taskReward, kind: 'earning', source: 'task' },
    { id: 'expense-reimbursement', label: 'เบิกค่าใช้จ่ายที่อนุมัติ', amount: params.expenseReimbursement, kind: 'earning', source: 'expense' },
    { id: 'manual-bonus', label: 'โบนัสปรับเพิ่ม', amount: params.manualBonus, kind: 'earning', source: 'manual' },
    { id: 'late-deduction', label: 'หักเข้างานสาย', amount: params.lateDeduction, kind: 'deduction', source: 'late' },
    { id: 'absence-deduction', label: 'หักขาดงาน', amount: params.absenceDeduction, kind: 'deduction', source: 'absence' },
    { id: 'leave-deduction', label: 'หักวันลา', amount: params.leaveDeduction, kind: 'deduction', source: 'leave' },
    { id: 'advance-deduction', label: 'หักเบิกเงินล่วงหน้า', amount: params.advanceDeduction, kind: 'deduction', source: 'advance' },
    { id: 'manual-deduction', label: 'รายการหักปรับลด', amount: params.manualDeduction, kind: 'deduction', source: 'manual' },
  ];

  return rows.filter((row) => row.amount > 0);
}

export function getAssignmentForUserOnDate(assignments: ShiftAssignment[], userId: string, workDate: string) {
  return assignments.find((assignment) => assignment.user_id === userId && assignment.work_date === workDate);
}

export function getBranchPolicyForBranch(
  branchPolicies: BranchAttendancePolicy[],
  branchId?: string | null,
) {
  if (!branchId) {
    return undefined;
  }

  return branchPolicies.find((policy) => policy.branch_id === branchId);
}

export function resolveShiftForUserDate(params: {
  user: User;
  workDate: string;
  assignments: ShiftAssignment[];
  branchPolicies: BranchAttendancePolicy[];
}) {
  const { user, workDate, assignments, branchPolicies } = params;
  const assignment = getAssignmentForUserOnDate(assignments, user.id, workDate);

  if (assignment) {
    return {
      branch_id: assignment.branch_id ?? user.branch_id,
      shift_template_id: assignment.shift_template_id,
      work_date: assignment.work_date,
      shift_name: assignment.shift_name,
      start_time: normalizeTimeValue(assignment.start_time),
      end_time: normalizeTimeValue(assignment.end_time),
      break_minutes: toNumberValue(assignment.break_minutes, DEFAULT_BREAK_MINUTES),
      late_grace_minutes: toNumberValue(assignment.late_grace_minutes, DEFAULT_GRACE_MINUTES),
      early_out_grace_minutes: toNumberValue(assignment.early_out_grace_minutes, DEFAULT_EARLY_OUT_GRACE_MINUTES),
      minimum_ot_minutes: toNumberValue(assignment.minimum_ot_minutes, DEFAULT_MINIMUM_OT_MINUTES),
      status: assignment.status,
      source: 'assignment' as const,
    };
  }

  const branchPolicy = getBranchPolicyForBranch(branchPolicies, user.branch_id);

  if (branchPolicy) {
    return {
      branch_id: user.branch_id,
      work_date: workDate,
      shift_name: 'เวลามาตรฐานสาขา',
      start_time: normalizeTimeValue(branchPolicy.shift_start_time || DEFAULT_SHIFT_START),
      end_time: normalizeTimeValue(branchPolicy.shift_end_time || DEFAULT_SHIFT_END),
      break_minutes: toNumberValue(branchPolicy.break_minutes, DEFAULT_BREAK_MINUTES),
      late_grace_minutes: toNumberValue(branchPolicy.late_grace_minutes, DEFAULT_GRACE_MINUTES),
      early_out_grace_minutes: toNumberValue(branchPolicy.early_out_grace_minutes, DEFAULT_EARLY_OUT_GRACE_MINUTES),
      minimum_ot_minutes: toNumberValue(branchPolicy.minimum_ot_minutes, DEFAULT_MINIMUM_OT_MINUTES),
      status: 'scheduled' as const,
      source: 'branch_policy' as const,
    };
  }

  return {
    branch_id: user.branch_id,
    work_date: workDate,
    shift_name: 'ค่าเริ่มต้นระบบ',
    start_time: DEFAULT_SHIFT_START,
    end_time: DEFAULT_SHIFT_END,
    break_minutes: DEFAULT_BREAK_MINUTES,
    late_grace_minutes: DEFAULT_GRACE_MINUTES,
    early_out_grace_minutes: DEFAULT_EARLY_OUT_GRACE_MINUTES,
    minimum_ot_minutes: DEFAULT_MINIMUM_OT_MINUTES,
    status: 'scheduled' as const,
    source: 'fallback' as const,
  };
}

export function getAttendancePairForDate(params: {
  records: AttendanceRecord[];
  userId: string;
  workDate: string;
  shift?: ResolvedShiftConfig;
}) {
  const { records, userId, workDate, shift } = params;

  if (!shift) {
    const dayRecords = records
      .filter((record) => record.user_id === userId && formatRecordDate(record) === workDate)
      .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());

    return {
      checkIn: dayRecords.find((record) => record.type === 'check_in'),
      checkOut: [...dayRecords].reverse().find((record) => record.type === 'check_out'),
    };
  }

  const { start, end } = getShiftInterval(shift);
  const windowStart = startOfDay(start);
  const windowEnd = endOfDay(end);
  const relevantRecords = records
    .filter((record) => {
      if (record.user_id !== userId) {
        return false;
      }

      const createdAt = parseISO(record.created_at);
      return createdAt >= windowStart && createdAt <= windowEnd;
    })
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());

  return {
    checkIn: relevantRecords.find((record) => record.type === 'check_in'),
    checkOut: [...relevantRecords].reverse().find((record) => record.type === 'check_out'),
  };
}

function isApprovedLeaveForDate(params: {
  requests: EmployeeRequest[];
  userId: string;
  workDate: string;
}) {
  const { requests, userId, workDate } = params;

  return requests.some((request) => {
    if (request.user_id !== userId || request.request_type !== 'leave' || request.status !== 'approved') {
      return false;
    }

    if (!request.start_date) {
      return false;
    }

    const startDate = request.start_date;
    const endDate = request.end_date || request.start_date;
    return workDate >= startDate && workDate <= endDate;
  });
}

export function calculateDailyAttendanceSummary(params: {
  user: User;
  workDate: string;
  records: AttendanceRecord[];
  assignments: ShiftAssignment[];
  branchPolicies: BranchAttendancePolicy[];
  requests?: EmployeeRequest[];
}) {
  const { user, workDate, records, assignments, branchPolicies, requests = [] } = params;
  const shift = resolveShiftForUserDate({
    user,
    workDate,
    assignments,
    branchPolicies,
  });
  const pair = getAttendancePairForDate({
    records,
    userId: user.id,
    workDate,
    shift,
  });
  const approvedLeave = isApprovedLeaveForDate({
    requests,
    userId: user.id,
    workDate,
  });

  if (shift.status === 'day_off' || shift.status === 'holiday') {
    const workedMinutes = pair.checkIn && pair.checkOut
      ? Math.max(0, differenceInMinutes(parseISO(pair.checkOut.created_at), parseISO(pair.checkIn.created_at)))
      : 0;

    return {
      work_date: workDate,
      status: shift.status,
      source: shift.source,
      scheduled: false,
      leave_day: false,
      absent: false,
      has_check_in: Boolean(pair.checkIn),
      has_check_out: Boolean(pair.checkOut),
      checkIn: pair.checkIn,
      checkOut: pair.checkOut,
      shift,
      worked_minutes: workedMinutes,
      scheduled_minutes: 0,
      late_minutes: 0,
      early_out_minutes: 0,
      ot_minutes: workedMinutes,
    } satisfies DailyAttendanceSummary;
  }

  if (shift.status === 'leave' || approvedLeave) {
    return {
      work_date: workDate,
      status: 'leave',
      source: shift.source,
      scheduled: true,
      leave_day: true,
      absent: false,
      has_check_in: Boolean(pair.checkIn),
      has_check_out: Boolean(pair.checkOut),
      checkIn: pair.checkIn,
      checkOut: pair.checkOut,
      shift,
      worked_minutes: 0,
      scheduled_minutes: Math.max(
        0,
        differenceInMinutes(getShiftInterval(shift).end, getShiftInterval(shift).start) - shift.break_minutes,
      ),
      late_minutes: 0,
      early_out_minutes: 0,
      ot_minutes: 0,
    } satisfies DailyAttendanceSummary;
  }

  const { start, end } = getShiftInterval(shift);
  const scheduledMinutes = Math.max(0, differenceInMinutes(end, start) - shift.break_minutes);
  const graceStart = addDays(start, 0);
  graceStart.setMinutes(graceStart.getMinutes() + shift.late_grace_minutes);
  const earlyOutLimit = addDays(end, 0);
  earlyOutLimit.setMinutes(earlyOutLimit.getMinutes() - shift.early_out_grace_minutes);

  const workedMinutes = pair.checkIn && pair.checkOut
    ? Math.max(0, differenceInMinutes(parseISO(pair.checkOut.created_at), parseISO(pair.checkIn.created_at)) - shift.break_minutes)
    : 0;
  const lateMinutes = pair.checkIn
    ? Math.max(0, differenceInMinutes(parseISO(pair.checkIn.created_at), graceStart))
    : 0;
  const earlyOutMinutes = pair.checkOut
    ? Math.max(0, differenceInMinutes(earlyOutLimit, parseISO(pair.checkOut.created_at)))
    : 0;
  const rawOtMinutes = pair.checkOut
    ? Math.max(0, differenceInMinutes(parseISO(pair.checkOut.created_at), end))
    : 0;
  const otMinutes = rawOtMinutes >= shift.minimum_ot_minutes ? rawOtMinutes : 0;
  const isScheduledShift = shift.status === 'scheduled' && shift.source !== 'fallback';
  const isAbsent = isScheduledShift && !pair.checkIn;

  return {
    work_date: workDate,
    status: isAbsent ? 'absent' : pair.checkIn ? 'worked' : 'unscheduled',
    source: shift.source,
    scheduled: isScheduledShift,
    leave_day: false,
    absent: isAbsent,
    has_check_in: Boolean(pair.checkIn),
    has_check_out: Boolean(pair.checkOut),
    checkIn: pair.checkIn,
    checkOut: pair.checkOut,
    shift,
    worked_minutes: workedMinutes,
    scheduled_minutes: scheduledMinutes,
    late_minutes: lateMinutes,
    early_out_minutes: earlyOutMinutes,
    ot_minutes: otMinutes,
  } satisfies DailyAttendanceSummary;
}

export function buildPayrollSummary(params: {
  user: User;
  startDate: string;
  endDate: string;
  records: AttendanceRecord[];
  assignments: ShiftAssignment[];
  branchPolicies: BranchAttendancePolicy[];
  requests?: EmployeeRequest[];
  tasks?: Task[];
  taskTemplates?: TaskTemplate[];
  compensationProfile?: CompensationProfile | null;
  manualAdjustments?: { bonus: number; deduction: number };
}) {
  const {
    user,
    startDate,
    endDate,
    records,
    assignments,
    branchPolicies,
    requests = [],
    tasks = [],
    taskTemplates = [],
    compensationProfile,
    manualAdjustments = { bonus: 0, deduction: 0 },
  } = params;

  const days = eachDayOfInterval({
    start: createLocalDateTime(startDate, '00:00'),
    end: createLocalDateTime(endDate, '23:59'),
  });
  const dailySummaries = days.map((day) => {
    const workDate = format(day, 'yyyy-MM-dd');
    return calculateDailyAttendanceSummary({
      user,
      workDate,
      records,
      assignments,
      branchPolicies,
      requests,
    });
  });

  const scheduledDays = dailySummaries.filter((summary) => summary.scheduled).length;
  const workedDays = dailySummaries.filter((summary) => summary.has_check_in).length;
  const leaveDays = dailySummaries.filter((summary) => summary.leave_day).length;
  const absentDays = dailySummaries.filter((summary) => summary.absent).length;
  const totalLateMinutes = dailySummaries.reduce((sum, summary) => sum + summary.late_minutes, 0);
  const totalEarlyOutMinutes = dailySummaries.reduce((sum, summary) => sum + summary.early_out_minutes, 0);
  const totalOtMinutes = dailySummaries.reduce((sum, summary) => sum + summary.ot_minutes, 0);
  const totalWorkedMinutes = dailySummaries.reduce((sum, summary) => sum + summary.worked_minutes, 0);
  const lateDays = dailySummaries.filter((summary) => summary.late_minutes > 0).length;
  const earlyOutDays = dailySummaries.filter((summary) => summary.early_out_minutes > 0).length;

  const payType = compensationProfile?.pay_type || 'daily';
  const baseRate = toNumberValue(compensationProfile?.base_rate, 0);
  const otRate = toNumberValue(compensationProfile?.ot_rate, 0);
  const lateDeductionRate = compensationProfile
    ? toNumberValue(compensationProfile.late_deduction_rate, 1)
    : 1;
  const absenceDeductionRate = toNumberValue(compensationProfile?.absence_deduction_rate, 0);
  const leaveDeductionRate = toNumberValue(compensationProfile?.leave_deduction_rate, 0);

  const grossPay = payType === 'hourly'
    ? (totalWorkedMinutes / 60) * baseRate
    : payType === 'monthly'
      ? baseRate
      : workedDays * baseRate;

  const otPay = (totalOtMinutes / 60) * otRate;
  const templateById = new Map(taskTemplates.map((template) => [template.id, template]));
  const approvedTasks = tasks.filter((task) => {
    if (task.assigned_to !== user.id || task.status !== 'approved') {
      return false;
    }

    const taskDate = formatRecordLikeDate(task.due_date || task.created_at);
    return isDateWithinInclusiveRange(taskDate, startDate, endDate);
  });
  const taskRewards = approvedTasks.reduce(
    (totals, task) => {
      const template = task.template_id ? templateById.get(task.template_id) : null;
      const reward = getMilestoneReward(task, template);

      if (isAttendanceTask(task, template)) {
        totals.attendance += reward;
      } else {
        totals.task += reward;
      }

      return totals;
    },
    { task: 0, attendance: 0 },
  );
  const taskReward = taskRewards.task;
  const attendanceReward = taskRewards.attendance;
  const expenseReimbursement = sumMoneyRequests({
    requests,
    userId: user.id,
    requestType: 'expense',
    startDate,
    endDate,
  });
  const lateDeduction = totalLateMinutes * lateDeductionRate;
  const absenceDeduction = absentDays * absenceDeductionRate;
  const leaveDeduction = leaveDays * leaveDeductionRate;
  const advanceDeduction = sumMoneyRequests({
    requests,
    userId: user.id,
    requestType: 'advance',
    startDate,
    endDate,
  });
  
  const manualBonus = toNumberValue(manualAdjustments.bonus, 0);
  const manualDeduction = toNumberValue(manualAdjustments.deduction, 0);

  const totalEarnings = grossPay + otPay + taskReward + attendanceReward + expenseReimbursement + manualBonus;
  const totalDeductions = lateDeduction + absenceDeduction + leaveDeduction + advanceDeduction + manualDeduction;
  const netPay = totalEarnings - totalDeductions;
  const moneyLines = buildPayrollMoneyLines({
    grossPay,
    otPay,
    taskReward,
    attendanceReward,
    expenseReimbursement,
    lateDeduction,
    absenceDeduction,
    leaveDeduction,
    advanceDeduction,
    manualBonus,
    manualDeduction,
  });

  return {
    user_id: user.id,
    start_date: startDate,
    end_date: endDate,
    scheduled_days: scheduledDays,
    worked_days: workedDays,
    leave_days: leaveDays,
    absent_days: absentDays,
    late_days: lateDays,
    total_late_minutes: totalLateMinutes,
    early_out_days: earlyOutDays,
    total_early_out_minutes: totalEarlyOutMinutes,
    total_ot_minutes: totalOtMinutes,
    total_worked_minutes: totalWorkedMinutes,
    gross_pay: grossPay,
    ot_pay: otPay,
    task_reward: taskReward,
    attendance_reward: attendanceReward,
    expense_reimbursement: expenseReimbursement,
    late_deduction: lateDeduction,
    absence_deduction: absenceDeduction,
    leave_deduction: leaveDeduction,
    advance_deduction: advanceDeduction,
    manual_bonus: manualBonus,
    manual_deduction: manualDeduction,
    total_earnings: totalEarnings,
    total_deductions: totalDeductions,
    net_pay: netPay,
    money_lines: moneyLines,
    daily_summaries: dailySummaries,
  } satisfies PayrollSummary;
}
