'use client';

import { useMemo, useState, useRef } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Download,
  Info,
  Pencil,
  Search,
  ShieldCheck,
  TimerReset,
  UserMinus,
  Zap,
  Coins,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import { useAuthStore } from '@/store/authStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useBranchStore } from '@/store/branchStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useHrStore } from '@/store/hrStore';
import { exportToExcel } from '@/lib/export';
import {
  calculateDailyAttendanceSummary,
  formatMinutesAsHours,
  type DailyAttendanceSummary,
} from '@/lib/hr';
import type { User } from '@/lib/types';
import { formatThaiDate, getCurrentDateStr } from '@/lib/dateUtils';

function isoToDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Build `yyyy-MM-ddTHH:mm` for datetime-local using shift time (`08:30` / `08:30:00`). */
function shiftClockToDatetimeLocal(workDate: string, timeStr?: string): string {
  const raw = (timeStr ?? '08:00').trim().split(':');
  const h = Number.parseInt(raw[0] ?? '8', 10);
  const m = Number.parseInt(raw[1] ?? '0', 10);
  const hh = String(Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 8).padStart(2, '0');
  const mm = String(Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0).padStart(2, '0');
  return `${workDate}T${hh}:${mm}`;
}

type EditTarget = {
  employee: User;
  summary: DailyAttendanceSummary;
};

function getSummaryVariant(params: {
  absent: boolean;
  leaveDay: boolean;
  hasCheckIn: boolean;
  lateMinutes: number;
  earlyOutMinutes: number;
}) {
  const { absent, leaveDay, hasCheckIn, lateMinutes, earlyOutMinutes } = params;

  if (absent) {
    return 'danger' as const;
  }

  if (leaveDay) {
    return 'warning' as const;
  }

  if (lateMinutes > 0 || earlyOutMinutes > 0) {
    return 'warning' as const;
  }

  if (hasCheckIn) {
    return 'success' as const;
  }

  return 'default' as const;
}

function getSummaryLabel(params: {
  scheduled: boolean;
  absent: boolean;
  leaveDay: boolean;
  hasCheckIn: boolean;
  lateMinutes: number;
  earlyOutMinutes: number;
}) {
  const { scheduled, absent, leaveDay, hasCheckIn, lateMinutes, earlyOutMinutes } = params;

  if (absent) {
    return 'ขาดงาน';
  }

  if (leaveDay) {
    return 'ลา';
  }

  if (!scheduled && !hasCheckIn) {
    return 'ไม่มีกะ';
  }

  if (lateMinutes > 0 && earlyOutMinutes > 0) {
    return 'สายและออกก่อน';
  }

  if (lateMinutes > 0) {
    return 'มาสาย';
  }

  if (earlyOutMinutes > 0) {
    return 'ออกก่อนเวลา';
  }

  if (hasCheckIn) {
    return 'ปกติ';
  }

  return 'รอบันทึกเวลา';
}

function InteractiveRow({ employee, summary, canCorrect, openCorrectionModal, children }: { employee: User, summary: DailyAttendanceSummary, canCorrect: boolean, openCorrectionModal: (employee: User, summary: DailyAttendanceSummary) => void, children: React.ReactNode }) {
  const timeoutRef = useRef<NodeJS.Timeout>(undefined);

  const handleTouchStart = () => {
    if (!canCorrect) return;
    timeoutRef.current = setTimeout(() => {
      openCorrectionModal(employee, summary);
    }, 500);
  };

  const clearTouch = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!canCorrect) return;
    if (window.matchMedia('(hover: hover)').matches || (e.nativeEvent as any).pointerType === 'mouse') {
      openCorrectionModal(employee, summary);
    }
  };

  return (
    <tr 
      key={employee.id} 
      className="group hover:bg-slate-50/80 transition-colors cursor-pointer"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={clearTouch}
      onTouchMove={clearTouch}
      onTouchCancel={clearTouch}
      style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
    >
      {children}
    </tr>
  );
}

export default function AttendanceMonitoringPage() {
  const { currentUser } = useAuthStore();
  const attendanceRecords = useAttendanceStore((state) => state.records);
  const updateAttendanceTimes = useAttendanceStore((state) => state.updateAttendanceTimes);
  const addManagerManualPunch = useAttendanceStore((state) => state.addManagerManualPunch);
  const branches = useBranchStore((state) => state.branches);
  const getBranchById = useBranchStore((state) => state.getBranchById);
  const users = useEmployeeStore((state) => state.users).filter(u => u.status !== 'inactive');
  const {
    branchPolicies,
    employeeRequests,
    schemaMessage,
    schemaReady,
    shiftAssignments,
    getBranchPolicy,
    upsertBranchPolicy,
  } = useHrStore();

  const [selectedDate, setSelectedDate] = useState(getCurrentDateStr());
  const [selectedBranchId, setSelectedBranchId] = useState(currentUser?.role === 'manager' ? currentUser.branch_id : 'all');
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [checkInLocal, setCheckInLocal] = useState('');
  const [checkOutLocal, setCheckOutLocal] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');
  const [editError, setEditError] = useState('');
  const [saveTimesLoading, setSaveTimesLoading] = useState(false);
  
  const [checkInReward, setCheckInReward] = useState('50');
  const [rewardUpdating, setRewardUpdating] = useState(false);
  const rewardTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync checkInReward when branch changes
  useEffect(() => {
    if (selectedBranchId && selectedBranchId !== 'all') {
      const policy = getBranchPolicy(selectedBranchId);
      if (policy && policy.check_in_reward !== undefined) {
        setCheckInReward(policy.check_in_reward.toString());
      } else {
        setCheckInReward('50');
      }
    }
  }, [selectedBranchId, getBranchPolicy]);

  const updateReward = async (val: string) => {
    if (!selectedBranchId || selectedBranchId === 'all') return;
    const amount = parseInt(val, 10);
    if (isNaN(amount) || amount < 0) return;
    
    setRewardUpdating(true);
    // 1. Update policy
    await upsertBranchPolicy(selectedBranchId, { check_in_reward: amount });
    
    // 2. Update today's tasks so dashboard updates instantly
    const today = getCurrentDateStr();
    await supabase
      .from('tasks')
      .update({ reward_amount: amount })
      .like('title', '%เช็คอิน%')
      .eq('status', 'pending')
      .eq('due_date', today);
      
    setRewardUpdating(false);
  };

  const handleRewardChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCheckInReward(val);
    
    if (rewardTimeoutRef.current) clearTimeout(rewardTimeoutRef.current);
    rewardTimeoutRef.current = setTimeout(() => {
      updateReward(val);
    }, 800);
  };

  const canCorrectAttendance =
    currentUser?.role === 'admin' || currentUser?.role === 'manager';

  function openCorrectionModal(employee: User, summary: DailyAttendanceSummary) {
    setEditError('');
    setCorrectionNote('');
    setEditTarget({ employee, summary });
    const workDate = summary.work_date || selectedDate;
    setCheckInLocal(
      summary.checkIn
        ? isoToDatetimeLocalValue(summary.checkIn.created_at)
        : shiftClockToDatetimeLocal(workDate, summary.shift?.start_time),
    );
    setCheckOutLocal(
      summary.checkOut
        ? isoToDatetimeLocalValue(summary.checkOut.created_at)
        : shiftClockToDatetimeLocal(workDate, summary.shift?.end_time ?? summary.shift?.start_time ?? '17:30'),
    );
  }

  function closeCorrectionModal() {
    setEditTarget(null);
    setEditError('');
    setCorrectionNote('');
    setCheckInLocal('');
    setCheckOutLocal('');
    setSaveTimesLoading(false);
  }

  async function submitCorrectionTimes() {
    if (!editTarget) {
      return;
    }

    const { employee, summary } = editTarget;
    const note = correctionNote.trim() || undefined;

    const hasIn = checkInLocal.trim().length > 0;
    const hasOut = checkOutLocal.trim().length > 0;

    if (summary.checkIn && !hasIn) {
      setEditError('กรุณาระบุเวลาเข้างาน (มีรายการเดิมในระบบแล้ว — ว่างไม่ได้)');
      return;
    }

    if (summary.checkOut && !hasOut) {
      setEditError('กรุณาระบุเวลาออกงาน (มีรายการเดิมในระบบแล้ว — ว่างไม่ได้)');
      return;
    }

    if (!summary.checkIn && !summary.checkOut && !hasIn && !hasOut) {
      setEditError('กรุณาระบุเวลาเข้างานหรือออกอย่างน้อยหนึ่งอย่าง');
      return;
    }

    let inMs = hasIn ? new Date(checkInLocal).getTime() : NaN;
    let outMs = hasOut ? new Date(checkOutLocal).getTime() : NaN;

    if (hasIn && Number.isNaN(inMs)) {
      setEditError('เวลาเข้างานไม่ถูกต้อง');
      return;
    }

    if (hasOut && Number.isNaN(outMs)) {
      setEditError('เวลาออกงานไม่ถูกต้อง');
      return;
    }

    if (hasIn && hasOut && outMs < inMs) {
      setEditError('เวลาออกงานต้องอยู่หลังเวลาเข้างาน');
      return;
    }

    const updates: Array<{ id: string; created_at: string }> = [];

    if (summary.checkIn && hasIn) {
      const orig = isoToDatetimeLocalValue(summary.checkIn.created_at);
      if (checkInLocal !== orig) {
        updates.push({ id: summary.checkIn.id, created_at: new Date(checkInLocal).toISOString() });
      }
    }

    if (summary.checkOut && hasOut) {
      const orig = isoToDatetimeLocalValue(summary.checkOut.created_at);
      if (checkOutLocal !== orig) {
        updates.push({ id: summary.checkOut.id, created_at: new Date(checkOutLocal).toISOString() });
      }
    }

    const addCheckIn = !summary.checkIn && hasIn;
    const addCheckOut = !summary.checkOut && hasOut;

    if (!addCheckIn && !addCheckOut && updates.length === 0) {
      setEditError('ยังไม่มีการเปลี่ยนแปลง');
      return;
    }

    setEditError('');
    setSaveTimesLoading(true);

    if (addCheckIn) {
      const rIn = await addManagerManualPunch({
        userId: employee.id,
        branchId: employee.branch_id,
        type: 'check_in',
        createdAt: new Date(checkInLocal).toISOString(),
        note,
      });
      if (!rIn.success) {
        setEditError(rIn.error || 'เพิ่มเวลาเข้างานไม่สำเร็จ');
        setSaveTimesLoading(false);
        return;
      }
    }

    if (updates.length > 0) {
      const rPatch = await updateAttendanceTimes(updates, note);
      if (!rPatch.success) {
        setEditError(rPatch.error || 'อัปเดตเวลาไม่สำเร็จ');
        setSaveTimesLoading(false);
        return;
      }
    }

    if (addCheckOut) {
      const rOut = await addManagerManualPunch({
        userId: employee.id,
        branchId: employee.branch_id,
        type: 'check_out',
        createdAt: new Date(checkOutLocal).toISOString(),
        note,
      });
      if (!rOut.success) {
        setEditError(rOut.error || 'เพิ่มเวลาออกงานไม่สำเร็จ');
        setSaveTimesLoading(false);
        return;
      }
    }

    setSaveTimesLoading(false);
    closeCorrectionModal();
  }

  const activeBranchId = selectedBranchId === 'all' ? '' : selectedBranchId;

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

  const employeeRows = useMemo(() => {
    return branchEmployees
      .filter((employee) => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) {
          return true;
        }

        return employee.full_name.toLowerCase().includes(keyword) || employee.team_id.toLowerCase().includes(keyword);
      })
      .map((employee) => {
        const summary = calculateDailyAttendanceSummary({
          user: employee,
          workDate: selectedDate,
          records: attendanceRecords,
          assignments: shiftAssignments,
          branchPolicies,
          requests: employeeRequests,
        });

        return {
          employee,
          branch: getBranchById(employee.branch_id),
          summary,
        };
      })
      .sort((left, right) => {
        const leftScore = (left.summary.absent ? 3 : 0) + (left.summary.late_minutes > 0 ? 2 : 0) + (left.summary.early_out_minutes > 0 ? 1 : 0);
        const rightScore = (right.summary.absent ? 3 : 0) + (right.summary.late_minutes > 0 ? 2 : 0) + (right.summary.early_out_minutes > 0 ? 1 : 0);
        if (rightScore !== leftScore) {
          return rightScore - leftScore;
        }

        return left.employee.full_name.localeCompare(right.employee.full_name, 'th');
      });
  }, [attendanceRecords, branchEmployees, branchPolicies, employeeRequests, getBranchById, search, selectedDate, shiftAssignments]);

  const stats = useMemo(() => ({
    scheduled: employeeRows.filter((row) => row.summary.scheduled).length,
    checkedIn: employeeRows.filter((row) => row.summary.has_check_in).length,
    late: employeeRows.filter((row) => row.summary.late_minutes > 0).length,
    absent: employeeRows.filter((row) => row.summary.absent).length,
    otMinutes: employeeRows.reduce((sum, row) => sum + row.summary.ot_minutes, 0),
  }), [employeeRows]);

  const handleExport = () => {
    const exportRows = employeeRows.map((row) => ({
      วันที่: formatThaiDate(row.summary.work_date),
      พนักงาน: row.employee.full_name,
      สาขา: row.branch?.name || '-',
      ทีม: row.employee.team_id || '-',
      กะ: row.summary.shift?.shift_name || '-',
      เวลาเข้า: row.summary.checkIn ? new Date(row.summary.checkIn.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-',
      เวลาออก: row.summary.checkOut ? new Date(row.summary.checkOut.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-',
      ชั่วโมงทำงาน: formatMinutesAsHours(row.summary.worked_minutes),
      ระยะเวลาสาย: formatMinutesAsHours(row.summary.late_minutes),
      ระยะเวลาออกก่อน: formatMinutesAsHours(row.summary.early_out_minutes),
      ชั่วโมงโอที: formatMinutesAsHours(row.summary.ot_minutes),
      สถานะ: getSummaryLabel({
        scheduled: row.summary.scheduled,
        absent: row.summary.absent,
        leaveDay: row.summary.leave_day,
        hasCheckIn: row.summary.has_check_in,
        lateMinutes: row.summary.late_minutes,
        earlyOutMinutes: row.summary.early_out_minutes,
      }),
    }));

    exportToExcel(exportRows, `attendance-summary-${selectedDate}`, 'Attendance');
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <TimerReset className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 leading-none">ติดตามการเข้างาน</h1>
            <p className="text-sm text-slate-500 mt-2">ตรวจสอบสถานะรายวัน สาย ขาด และโอทีแบบเรียลไทม์</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            icon={<Download className="w-4 h-4" />} 
            onClick={handleExport}
            className="hover:border-primary-200 hover:text-primary-700 transition-colors"
          >
            ส่งออกข้อมูล (Excel)
          </Button>
        </div>
      </div>

      {!schemaReady && (
        <Card statusColor="amber" className="bg-amber-50/70 border-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">ยังไม่พบข้อมูล HR ในฐานข้อมูล</p>
              <p className="text-xs text-amber-800 mt-1">{schemaMessage}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Reward Setting Bar */}
      {selectedBranchId && selectedBranchId !== 'all' && (
        <Card className="p-3 bg-emerald-50 border-emerald-100 flex items-center justify-between shadow-sm">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                 <Coins className="w-5 h-5" />
              </div>
              <div>
                 <p className="text-sm font-bold text-emerald-900">ค่าตอบแทนเช็คอินรายวัน (บาท/วัน)</p>
                 <p className="text-xs font-medium text-emerald-700">มีผลทันทีกับภารกิจเช็คอินของวันนี้และวันถัดไป</p>
              </div>
           </div>
           <div className="flex items-center gap-2">
              {rewardUpdating && <div className="text-[10px] font-bold text-emerald-600 animate-pulse">กำลังบันทึก...</div>}
              <div className="w-24">
                 <Input 
                    type="number" 
                    value={checkInReward} 
                    onChange={handleRewardChange} 
                    min="0"
                    className="bg-white border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                 />
              </div>
           </div>
        </Card>
      )}

      {/* Operations Bar */}
      <div className="flex flex-col xl:flex-row gap-4">
        <div className="flex-1 bg-white p-2 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-2">
          <div className="flex-1 relative group">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
            </div>
            <input
              type="text"
              placeholder="ค้นหาชื่อพนักงาน หรือทีม..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-primary-500/20 focus:bg-white transition-all outline-none"
            />
          </div>

          <div className="flex flex-col md:flex-row items-center gap-2">
            <Select
              className="border-none bg-slate-50 hover:bg-slate-100 transition-colors rounded-2xl min-w-[180px]"
              value={selectedBranchId}
              onChange={(event) => setSelectedBranchId(event.target.value)}
              options={[
                ...(currentUser?.role !== 'manager' ? [{ value: 'all', label: 'ทุกสาขา (ภาพรวม)' }] : []),
                ...branches.map((branch) => ({ value: branch.id, label: branch.name }))
              ]}
              disabled={currentUser?.role === 'manager'}
            />
            
            <div className="flex items-center gap-2 bg-slate-50 rounded-2xl p-1 pr-3">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-sm font-bold focus:outline-none"
              />
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSelectedDate(getCurrentDateStr())}
                className="text-[11px] font-bold text-primary-600 hover:bg-primary-50 px-2 py-1 h-auto"
              >
                วันนี้
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 text-white rounded-3xl px-6 py-3 flex items-center justify-center gap-4 shadow-lg">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400 leading-none">กำลังแสดงข้อมูลของวันที่</p>
            <p className="text-sm font-bold mt-1 text-emerald-50">{formatThaiDate(selectedDate)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'พนักงานมีกะวันนี้', value: stats.scheduled, icon: CalendarCheck, color: 'indigo', unit: 'คน' },
          { label: 'บันทึกเข้างานแล้ว', value: stats.checkedIn, icon: ShieldCheck, color: 'emerald', unit: 'คน' },
          { label: 'มาสาย / ล่าช้า', value: stats.late, icon: Clock3, color: 'amber', unit: 'คน' },
          { label: 'ขาดงาน / ไม่เช็คอิน', value: stats.absent, icon: UserMinus, color: 'red', unit: 'คน' },
          { label: 'ชั่วโมงโอทีรวม', value: formatMinutesAsHours(stats.otMinutes), icon: Zap, color: 'purple', unit: 'ชม.' },
        ].map((stat) => (
          <Card key={stat.label} className="group hover:border-slate-300 transition-all">
            <div className={`h-10 w-10 mb-3 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110
              ${stat.color === 'indigo' ? 'bg-indigo-50 text-indigo-600' : ''}
              ${stat.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' : ''}
              ${stat.color === 'amber' ? 'bg-amber-50 text-amber-600' : ''}
              ${stat.color === 'red' ? 'bg-red-50 text-red-600' : ''}
              ${stat.color === 'purple' ? 'bg-purple-50 text-purple-600' : ''}
            `}>
              <stat.icon className="w-5 h-5" />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider leading-none mb-2">{stat.label}</p>
            <div className="flex items-baseline gap-1 mt-1">
              <p className="text-xl font-black text-slate-900 leading-none">{stat.value}</p>
              {stat.unit && <span className="text-[10px] font-bold text-slate-400 leading-none">{stat.unit}</span>}
            </div>
          </Card>
        ))}
      </div>

      <Card padding="none" className="overflow-hidden border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1080px] border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-wider">
                <th className="px-6 py-4">พนักงาน</th>
                <th className="px-6 py-4">กะการทำงาน</th>
                <th className="px-6 py-3">เข้างาน</th>
                <th className="px-6 py-3">ออกงาน</th>
                <th className="px-6 py-3 text-center">ชม. งาน</th>
                <th className="px-6 py-3 text-center">สาย / ออกก่อน</th>
                <th className="px-6 py-3 text-center">โอที</th>
                <th className="px-6 py-4 text-center">สถานะ</th>
                {canCorrectAttendance ? (
                  <th className="px-6 py-4 text-center w-[96px]">แก้ไข</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employeeRows.length === 0 ? (
                <tr>
                  <td colSpan={canCorrectAttendance ? 9 : 8} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
                        <Search className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-400">ไม่พบข้อมูลพนักงาน</p>
                        <p className="text-xs text-slate-400 mt-1">ลองเปลี่ยนเงื่อนไขการค้นหาหรือสาขาที่เลือก</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : employeeRows.map((row) => {
                const { employee, summary } = row;
                const label = getSummaryLabel({
                  scheduled: summary.scheduled,
                  absent: summary.absent,
                  leaveDay: summary.leave_day,
                  hasCheckIn: summary.has_check_in,
                  lateMinutes: summary.late_minutes,
                  earlyOutMinutes: summary.early_out_minutes,
                });
                const variant = getSummaryVariant({
                  absent: summary.absent,
                  leaveDay: summary.leave_day,
                  hasCheckIn: summary.has_check_in,
                  lateMinutes: summary.late_minutes,
                  earlyOutMinutes: summary.early_out_minutes,
                });

                return (
                  <InteractiveRow 
                    key={employee.id}
                    employee={employee}
                    summary={summary}
                    canCorrect={canCorrectAttendance}
                    openCorrectionModal={openCorrectionModal}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {employee.avatar_url ? (
                          <div
                            role="img"
                            aria-label={employee.full_name}
                            className="h-10 w-10 rounded-full border border-slate-100 bg-cover bg-center shrink-0"
                            style={{ backgroundImage: `url(${employee.avatar_url})` }}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-xs shrink-0">
                            {employee.full_name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-bold text-slate-900 group-hover:text-primary-700 transition-colors">{employee.full_name}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{row.branch?.name || '-'} • {employee.team_id || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700">{summary.shift?.shift_name || '-'}</span>
                        <span className="text-[10px] font-bold text-slate-400 mt-0.5">
                          {summary.shift ? `${summary.shift.start_time} - ${summary.shift.end_time}` : 'ไม่มีข้อมูลกะ'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-slate-900 tabular-nums">
                          {summary.checkIn ? new Date(summary.checkIn.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </span>
                        {summary.checkIn && <span className="text-[9px] font-bold text-slate-400 uppercase">บันทึกเข้า</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-slate-900 tabular-nums">
                          {summary.checkOut ? new Date(summary.checkOut.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </span>
                        {summary.checkOut && <span className="text-[9px] font-bold text-slate-400 uppercase">บันทึกออก</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-sm font-bold text-slate-700 bg-slate-50 px-2 py-1 rounded-md">
                        {formatMinutesAsHours(summary.worked_minutes)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-center gap-1">
                        {summary.late_minutes > 0 && (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                            สาย {formatMinutesAsHours(summary.late_minutes)}
                          </span>
                        )}
                        {summary.early_out_minutes > 0 && (
                          <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                            ออกก่อน {formatMinutesAsHours(summary.early_out_minutes)}
                          </span>
                        )}
                        {summary.late_minutes === 0 && summary.early_out_minutes === 0 && (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {summary.ot_minutes > 0 ? (
                        <span className="text-sm font-black text-primary-700 flex items-center justify-center gap-1">
                          <Zap className="w-3.5 h-3.5 fill-current" />
                          {formatMinutesAsHours(summary.ot_minutes)}
                        </span>
                      ) : <span className="text-xs text-slate-300">-</span>}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Badge variant={variant} className="px-2.5 py-1 text-[10px] font-black uppercase tracking-tight">
                        {label}
                      </Badge>
                    </td>
                    {canCorrectAttendance ? (
                      <td className="px-6 py-4 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-9 px-2 text-primary-700 hover:bg-primary-50"
                          icon={<Pencil className="w-4 h-4" />}
                          ariaLabel={`แก้ไขหรือเพิ่มเวลาเข้าออก ${employee.full_name}`}
                          title="แก้ไขหรือเพิ่มเวลาเข้า-ออก"
                          onClick={() => openCorrectionModal(employee, summary)}
                        />
                      </td>
                    ) : null}
                  </InteractiveRow>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={Boolean(editTarget)}
        onClose={closeCorrectionModal}
        title="แก้ไขหรือเพิ่มเวลาเข้างาน / ออกงาน"
        size="sm"
      >
        {editTarget ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{editTarget.employee.full_name}</span>
              <span className="text-slate-400 mx-2">•</span>
              {formatThaiDate(editTarget.summary.work_date || selectedDate)}
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              ผู้จัดการ/แอดมินปรับเวลารายการเดิมได้ และเพิ่มรายการใหม่เมื่อพนักงานยังไม่มีเช็คอิน/เอาต์ — ระบบจะบันทึกหมายเหตุจากผู้ดำเนินการอัตโนมัติ
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide" htmlFor="edit-check-in-at">
                เวลาเข้างาน{' '}
                <span className="font-normal text-slate-400 normal-case">
                  {editTarget.summary.checkIn ? '(มีในระบบ — ปรับได้)' : '(ยังไม่มี — ระบุเพื่อเพิ่ม)'}
                </span>
              </label>
              <input
                id="edit-check-in-at"
                type="datetime-local"
                value={checkInLocal}
                onChange={(e) => setCheckInLocal(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide" htmlFor="edit-check-out-at">
                เวลาออกงาน{' '}
                <span className="font-normal text-slate-400 normal-case">
                  {editTarget.summary.checkOut ? '(มีในระบบ — ปรับได้)' : '(ยังไม่มี — ระบุเพื่อเพิ่ม)'}
                </span>
              </label>
              {!editTarget.summary.checkOut ? (
                <p className="text-[11px] text-slate-500">
                  เวลาเริ่มต้นจากกะเดียวกับตาราง (หรือ 17:30) — แก้ได้ตามจริง
                </p>
              ) : null}
              <input
                id="edit-check-out-at"
                type="datetime-local"
                value={checkOutLocal}
                onChange={(e) => setCheckOutLocal(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <Input
              id="edit-correction-note"
              label="หมายเหตุ (ไม่บังคับ)"
              placeholder="เช่น ลืมเช็คอิน / แก้ตามบัตรเวลา"
              value={correctionNote}
              onChange={(e) => setCorrectionNote(e.target.value)}
            />

            {editError ? (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{editError}</p>
            ) : null}

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={closeCorrectionModal}
                disabled={saveTimesLoading}
              >
                ยกเลิก
              </Button>
              <Button
                type="button"
                fullWidth
                loading={saveTimesLoading}
                onClick={() => void submitCorrectionTimes()}
              >
                บันทึก
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">เกณฑ์การคำนวณเวลา</h2>
              <p className="text-xs text-slate-500 mt-1">อ้างอิงตามกติกาค่าแรงและนโยบายของแต่ละสาขา</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'บันทึกการมาสาย', desc: 'เริ่มนับจากเวลาเริ่มกะ + ระยะผ่อนผัน (Grace Time) ที่กำหนดในนโยบายสาขา', icon: Clock3, color: 'amber' },
              { label: 'การออกก่อนเวลา', desc: 'นับเมื่อพนักงานเช็คเอาท์ก่อนเวลาเลิกกะ - ระยะผ่อนผันการออกก่อน (Early Out Grace)', icon: Zap, color: 'orange' },
              { label: 'การคิดโอที', desc: 'คำนวณจากเวลาหลังเลิกกะที่เกินกว่าเกณฑ์โอทีขั้นต่ำ (Minimum OT) ของสาขานั้นๆ', icon: ShieldCheck, color: 'emerald' },
            ].map((item) => (
              <div key={item.label} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 group">
                <div className={`p-2 rounded-lg w-fit mb-3 transition-colors 
                  ${item.color === 'amber' ? 'bg-amber-100 text-amber-600' : ''}
                  ${item.color === 'orange' ? 'bg-orange-100 text-orange-600' : ''}
                  ${item.color === 'emerald' ? 'bg-emerald-100 text-emerald-600' : ''}
                `}>
                  <item.icon className="w-4 h-4" />
                </div>
                <p className="text-sm font-bold text-slate-900">{item.label}</p>
                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-slate-50/50">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">สรุปภาพรวมวันนี้</h2>
              <p className="text-xs text-slate-500 mt-1">ไฮไลท์สำคัญที่ต้องตรวจสอบ</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
              <span className="text-xs font-bold text-slate-600">พนักงานที่มาสาย</span>
              <span className="text-sm font-black text-amber-600">{stats.late} ราย</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
              <span className="text-xs font-bold text-slate-600">พนักงานที่ขาดงาน</span>
              <span className="text-sm font-black text-red-600">{stats.absent} ราย</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-900 text-white shadow-lg shadow-indigo-200">
              <span className="text-xs font-bold text-indigo-100">โอทีรวมวันนี้</span>
              <span className="text-sm font-black text-white">{formatMinutesAsHours(stats.otMinutes)} ชม.</span>
            </div>
          </div>
          
          <p className="text-[10px] text-slate-400 mt-6 leading-relaxed text-center">
            ข้อมูลอัปเดตล่าสุด: {new Date().toLocaleTimeString('th-TH')}
          </p>
        </Card>
      </div>
    </div>
  );
}
