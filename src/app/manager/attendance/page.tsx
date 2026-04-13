'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Download,
  Info,
  Search,
  ShieldCheck,
  TimerReset,
  UserRound,
  UserMinus,
  Zap,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useAuthStore } from '@/store/authStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useBranchStore } from '@/store/branchStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useHrStore } from '@/store/hrStore';
import { exportToExcel } from '@/lib/export';
import {
  calculateDailyAttendanceSummary,
  formatMinutesAsHours,
} from '@/lib/hr';
import { formatThaiDate, getCurrentDateStr } from '@/lib/dateUtils';

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

export default function AttendanceMonitoringPage() {
  const { currentUser } = useAuthStore();
  const attendanceRecords = useAttendanceStore((state) => state.records);
  const branches = useBranchStore((state) => state.branches);
  const getBranchById = useBranchStore((state) => state.getBranchById);
  const users = useEmployeeStore((state) => state.users);
  const {
    branchPolicies,
    employeeRequests,
    schemaMessage,
    schemaReady,
    shiftAssignments,
  } = useHrStore();

  const [selectedDate, setSelectedDate] = useState(getCurrentDateStr());
  const [selectedBranchId, setSelectedBranchId] = useState(currentUser?.role === 'manager' ? currentUser.branch_id : 'all');
  const [search, setSearch] = useState('');

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
      นาทีสาย: row.summary.late_minutes,
      นาทีออกก่อน: row.summary.early_out_minutes,
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
            <p className="text-sm text-slate-500 mt-2">ตรวจสอบสถานะรายวัน สาย ขาด และโอทีแบบ Real-time</p>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employeeRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-20 text-center">
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
                  <tr key={employee.id} className="group hover:bg-slate-50/80 transition-colors">
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
                            สาย {summary.late_minutes}น.
                          </span>
                        )}
                        {summary.early_out_minutes > 0 && (
                          <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                            ออกก่อน {summary.early_out_minutes}น.
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

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
              { label: 'บันทึกการมาสาย', desc: 'เริ่มนับจากเวลาเริ่มกะ + Grace Time ที่กำหนดในนโยบายสาขา', icon: Clock3, color: 'amber' },
              { label: 'การออกก่อนเวลา', desc: 'นับเมื่อพนักงานเช็คเอาท์ก่อนเวลาเลิกกะ - Early Out Grace', icon: Zap, color: 'orange' },
              { label: 'การคิดโอที', desc: 'คำนวณจากเวลาหลังเลิกกะที่เกินกว่า Minimum OT ของสาขานั้นๆ', icon: ShieldCheck, color: 'emerald' },
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
