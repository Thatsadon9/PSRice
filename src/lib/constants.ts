// ==========================================
// WorkFlow Pro - Constants
// ==========================================

import type {
  ApprovalStatus,
  AttendanceStatus,
  CompensationType,
  EmployeeRequestType,
  Priority,
  ProofType,
  RecurrenceType,
  ReviewStatus,
  ShiftAssignmentStatus,
  TaskStatus,
} from './types';

// ---- Status Labels (Thai) ----

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  not_checked_in: 'ยังไม่ได้เช็กอิน',
  checked_in: 'เช็กอินแล้ว',
  late: 'เข้างานสาย',
  checked_out: 'เช็กเอาต์แล้ว',
  out_of_area: 'อยู่นอกพื้นที่',
  gps_unavailable: 'ไม่พบ GPS',
  failed_verification: 'ยืนยันไม่สำเร็จ',
};

export const ATTENDANCE_STATUS_COLORS: Record<AttendanceStatus, string> = {
  not_checked_in: 'bg-slate-100 text-slate-600',
  checked_in: 'bg-emerald-50 text-emerald-700',
  late: 'bg-amber-50 text-amber-700',
  checked_out: 'bg-blue-50 text-blue-700',
  out_of_area: 'bg-red-50 text-red-700',
  gps_unavailable: 'bg-orange-50 text-orange-700',
  failed_verification: 'bg-red-50 text-red-700',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'รอดำเนินการ',
  in_progress: 'กำลังดำเนินการ',
  submitted: 'ส่งแล้ว รอตรวจ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่ผ่าน',
  overdue: 'เลยกำหนด',
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  pending: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-50 text-blue-700',
  submitted: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  overdue: 'bg-red-100 text-red-800',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'ต่ำ',
  medium: 'ปานกลาง',
  high: 'สูง',
  critical: 'เร่งด่วน',
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-50 text-blue-700',
  high: 'bg-amber-50 text-amber-700',
  critical: 'bg-red-50 text-red-700',
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'รอตรวจสอบ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่ผ่าน',
};

export const REVIEW_STATUS_COLORS: Record<ReviewStatus, string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
};

export const PROOF_TYPE_LABELS: Record<ProofType, string> = {
  photo: 'รูปภาพ',
  video: 'วิดีโอ',
  text: 'ข้อความ',
  checklist: 'รายการตรวจสอบ',
  any: 'ไม่จำกัด',
};

export const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  daily: 'ทุกวัน',
  weekly: 'ทุกสัปดาห์',
  monthly: 'ทุกเดือน',
  once: 'ครั้งเดียว',
};

export const ROLE_LABELS: Record<string, string> = {
  admin: 'ผู้ดูแลระบบ',
  manager: 'ผู้จัดการ',
  employee: 'พนักงาน',
};

export const SHIFT_ASSIGNMENT_STATUS_LABELS: Record<ShiftAssignmentStatus, string> = {
  scheduled: 'วันทำงาน',
  day_off: 'วันหยุด',
  leave: 'ลา',
  holiday: 'วันหยุดนักขัตฤกษ์',
};

export const COMPENSATION_TYPE_LABELS: Record<CompensationType, string> = {
  daily: 'รายวัน',
  hourly: 'รายชั่วโมง',
  monthly: 'รายเดือน',
};

export const EMPLOYEE_REQUEST_TYPE_LABELS: Record<EmployeeRequestType, string> = {
  leave: 'คำขอลา',
  advance: 'เบิกเงินล่วงหน้า',
  expense: 'เบิกค่าใช้จ่าย',
};

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
  cancelled: 'ยกเลิก',
};

// ---- App Config ----

export const APP_NAME = 'PS Rice';
export const APP_DESCRIPTION = 'ระบบจัดการงานพนักงาน PS Rice Wholesale';

export const DEFAULT_GEOFENCE_RADIUS = 100;
export const MAX_GPS_ACCURACY = 100;
export const WORK_START_TIME = '08:30';
export const WORK_END_TIME = '17:30';
export const LATE_THRESHOLD_MINUTES = 15;

// ---- Navigation ----

export const EMPLOYEE_NAV_ITEMS = [
  { label: 'หน้าแรก', href: '/employee', icon: 'LayoutDashboard' },
  { label: 'คำขอ', href: '/employee/requests', icon: 'ReceiptText' },
  { label: 'งาน', href: '/employee/tasks', icon: 'Trophy' },
  { label: 'โปรไฟล์', href: '/employee/profile', icon: 'UserCircle' },
  { label: 'เพิ่มเติม', href: '/employee/settings', icon: 'Menu' },
];

export const MANAGER_NAV_ITEMS = [
  { label: 'แดชบอร์ด', href: '/manager', icon: 'LayoutDashboard' },
  { label: 'ตรวจงาน', href: '/manager/review', icon: 'CheckSquare' },
  { label: 'คำขออนุมัติ', href: '/manager/requests', icon: 'ReceiptText' },
  { label: 'พนักงาน', href: '/manager/employees', icon: 'Users' },
  { label: 'สาขา', href: '/manager/branches', icon: 'Building2' },
  { label: 'ตารางกะ', href: '/manager/schedule', icon: 'CalendarDays' },
  { label: 'การเข้างาน', href: '/manager/attendance', icon: 'Clock' },
  { label: 'เทมเพลตงาน', href: '/manager/templates', icon: 'FileText' },
  { label: 'มอบหมายงาน', href: '/manager/assignments', icon: 'CalendarCheck' },
  { label: 'ค่าแรง', href: '/manager/payroll', icon: 'WalletCards' },
  { label: 'รายงาน', href: '/manager/reports', icon: 'BarChart3' },
  { label: 'ตั้งค่า', href: '/manager/settings', icon: 'Settings' },
];

export const MANAGER_MOBILE_NAV_ITEMS = [
  { label: 'แดชบอร์ด', href: '/manager', icon: 'LayoutDashboard' },
  { label: 'ตรวจงาน', href: '/manager/review', icon: 'CheckSquare' },
  { label: 'พนักงาน', href: '/manager/employees', icon: 'Users' },
  { label: 'ค่าแรง', href: '/manager/payroll', icon: 'WalletCards' },
  { label: 'เพิ่มเติม', href: '/manager/more', icon: 'Menu' },
];
