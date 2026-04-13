'use client';

import { useMemo, useState } from 'react';
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
import { ATTENDANCE_STATUS_LABELS, COMPENSATION_TYPE_LABELS } from '@/lib/constants';
import { buildPayrollSummary, formatMinutesAsHours, getMonthDateRange, toNumberValue } from '@/lib/hr';
import type { CompensationProfile } from '@/lib/types';
import { AlertTriangle, Calculator, ReceiptText, Save, WalletCards } from 'lucide-react';

interface CompensationFormState {
  pay_type: CompensationProfile['pay_type'];
  base_rate: number;
  ot_rate: number;
  late_deduction_rate: number;
  absence_deduction_rate: number;
  leave_deduction_rate: number;
}

function createDefaultForm(): CompensationFormState {
  return {
    pay_type: 'daily',
    base_rate: 0,
    ot_rate: 0,
    late_deduction_rate: 0,
    absence_deduction_rate: 0,
    leave_deduction_rate: 0,
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(value || 0);
}

export default function PayrollPage() {
  const { currentUser } = useAuthStore();
  const attendanceStore = useAttendanceStore();
  const branchStore = useBranchStore();
  const employeeStore = useEmployeeStore();
  const {
    branchPolicies,
    employeeRequests,
    getCompensationProfile,
    schemaMessage,
    schemaReady,
    shiftAssignments,
    upsertCompensationProfile,
  } = useHrStore();

  const monthRange = getMonthDateRange(new Date());
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [rangeStart, setRangeStart] = useState(monthRange.start);
  const [rangeEnd, setRangeEnd] = useState(monthRange.end);
  const [formDrafts, setFormDrafts] = useState<Record<string, CompensationFormState>>({});
  const [saving, setSaving] = useState(false);

  const activeBranchId = selectedBranchId || currentUser?.branch_id || branchStore.branches[0]?.id || '';
  const branchEmployees = employeeStore.users.filter((user) => user.role === 'employee' && (!activeBranchId || user.branch_id === activeBranchId));
  const activeEmployeeId = selectedEmployeeId && branchEmployees.some((user) => user.id === selectedEmployeeId)
    ? selectedEmployeeId
    : branchEmployees[0]?.id || '';
  const selectedEmployee = branchEmployees.find((employee) => employee.id === activeEmployeeId) || null;
  const selectedProfile = selectedEmployee ? getCompensationProfile(selectedEmployee.id) : undefined;
  const defaultForm = selectedProfile
    ? {
        pay_type: selectedProfile.pay_type,
        base_rate: selectedProfile.base_rate,
        ot_rate: selectedProfile.ot_rate,
        late_deduction_rate: selectedProfile.late_deduction_rate,
        absence_deduction_rate: selectedProfile.absence_deduction_rate,
        leave_deduction_rate: selectedProfile.leave_deduction_rate,
      }
    : createDefaultForm();
  const form = formDrafts[activeEmployeeId] || defaultForm;

  const payrollSummary = useMemo(() => {
    const employee = branchEmployees.find((item) => item.id === activeEmployeeId);
    if (!employee) {
      return null;
    }

    return buildPayrollSummary({
      user: employee,
      startDate: rangeStart,
      endDate: rangeEnd,
      records: attendanceStore.records.filter((record) => record.user_id === employee.id),
      assignments: shiftAssignments,
      branchPolicies,
      requests: employeeRequests.filter((request) => request.user_id === employee.id && request.request_type === 'leave' && request.status === 'approved'),
      compensationProfile: {
        id: selectedProfile?.id || 'preview',
        user_id: employee.id,
        pay_type: form.pay_type,
        base_rate: toNumberValue(form.base_rate, 0),
        ot_rate: toNumberValue(form.ot_rate, 0),
        late_deduction_rate: toNumberValue(form.late_deduction_rate, 0),
        absence_deduction_rate: toNumberValue(form.absence_deduction_rate, 0),
        leave_deduction_rate: toNumberValue(form.leave_deduction_rate, 0),
        created_at: selectedProfile?.created_at || '',
        updated_at: selectedProfile?.updated_at || '',
      },
    });
  }, [activeEmployeeId, attendanceStore.records, branchEmployees, branchPolicies, employeeRequests, form, rangeEnd, rangeStart, selectedProfile?.created_at, selectedProfile?.id, selectedProfile?.updated_at, shiftAssignments]);

  const updateForm = (updates: Partial<CompensationFormState>) => {
    setFormDrafts((current) => ({
      ...current,
      [activeEmployeeId]: {
        ...(current[activeEmployeeId] || defaultForm),
        ...updates,
      },
    }));
  };

  const handleSaveProfile = async () => {
    if (!selectedEmployee) {
      return;
    }

    setSaving(true);
    await upsertCompensationProfile({
      id: selectedProfile?.id,
      user_id: selectedEmployee.id,
      pay_type: form.pay_type,
      base_rate: toNumberValue(form.base_rate, 0),
      ot_rate: toNumberValue(form.ot_rate, 0),
      late_deduction_rate: toNumberValue(form.late_deduction_rate, 0),
      absence_deduction_rate: toNumberValue(form.absence_deduction_rate, 0),
      leave_deduction_rate: toNumberValue(form.leave_deduction_rate, 0),
    });
    setSaving(false);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">คำนวณค่าแรง</h1>
          <p className="text-sm text-slate-500 mt-1">กรอกอัตราค่าแรงต่อคน แล้วให้ระบบดึงจำนวนกะ ชั่วโมง สาย ลา ขาด และ OT มาคำนวณให้ทันที</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <Select label="สาขา" options={branchStore.branches.map((branch) => ({ value: branch.id, label: branch.name }))} value={activeBranchId} onChange={(event) => { setSelectedBranchId(event.target.value); setSelectedEmployeeId(''); }} />
          <Select label="พนักงาน" options={branchEmployees.map((employee) => ({ value: employee.id, label: employee.full_name }))} value={activeEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)} disabled={branchEmployees.length === 0} />
        </div>
      </div>

      {!schemaReady && (
        <Card statusColor="amber" className="bg-amber-50/60">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">ยังไม่พบตาราง HR รอบใหม่ในฐานข้อมูล</p>
              <p className="text-xs text-amber-800 mt-1">{schemaMessage}</p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card>
          <div className="flex items-center gap-2">
            <WalletCards className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-slate-900">ตั้งค่าอัตราค่าแรง</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Select label="ประเภทค่าจ้าง" options={[{ value: 'daily', label: COMPENSATION_TYPE_LABELS.daily }, { value: 'hourly', label: COMPENSATION_TYPE_LABELS.hourly }, { value: 'monthly', label: COMPENSATION_TYPE_LABELS.monthly }]} value={form.pay_type} onChange={(event) => updateForm({ pay_type: event.target.value as CompensationProfile['pay_type'] })} />
            <Input label={form.pay_type === 'hourly' ? 'ค่าแรงต่อชั่วโมง' : form.pay_type === 'monthly' ? 'เงินเดือน' : 'ค่าแรงต่อวัน'} type="number" value={form.base_rate} onChange={(event) => updateForm({ base_rate: Number(event.target.value) })} />
            <Input label="OT ต่อชั่วโมง" type="number" value={form.ot_rate} onChange={(event) => updateForm({ ot_rate: Number(event.target.value) })} />
            <Input label="หักสายต่อนาที" type="number" value={form.late_deduction_rate} onChange={(event) => updateForm({ late_deduction_rate: Number(event.target.value) })} />
            <Input label="หักขาดต่อวัน" type="number" value={form.absence_deduction_rate} onChange={(event) => updateForm({ absence_deduction_rate: Number(event.target.value) })} />
            <Input label="หักลาต่อวัน" type="number" value={form.leave_deduction_rate} onChange={(event) => updateForm({ leave_deduction_rate: Number(event.target.value) })} />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Input label="เริ่มช่วงคำนวณ" type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} />
            <Input label="สิ้นสุดช่วงคำนวณ" type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} />
          </div>
          <Button fullWidth className="mt-4" onClick={() => void handleSaveProfile()} loading={saving} icon={<Save className="w-4 h-4" />}>บันทึกอัตราค่าแรง</Button>
          <div className="rounded-xl bg-slate-50 p-3 mt-4 text-xs text-slate-500 space-y-1">
            <p>สูตรที่ใช้ตอนนี้:</p>
            <p>ค่าจ้างพื้นฐาน {form.pay_type === 'hourly' ? 'คำนวณจากชั่วโมงทำงานจริง' : form.pay_type === 'monthly' ? 'ใช้เงินเดือนทั้งงวด' : 'คำนวณจากจำนวนกะที่ถูกจัด'}</p>
            <p>OT คิดจากชั่วโมง OT จริง, สายคิดตามนาที, ลาและขาดคิดตามจำนวนวัน</p>
          </div>
        </Card>

        <div className="xl:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-slate-900 text-white border-slate-900">
              <p className="text-xs text-slate-300">ค่าจ้างก่อนหัก</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(payrollSummary?.gross_pay || 0)}</p>
            </Card>
            <Card className="bg-emerald-600 text-white border-emerald-600">
              <p className="text-xs text-emerald-100">OT เพิ่ม</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(payrollSummary?.ot_pay || 0)}</p>
            </Card>
            <Card className="bg-primary-800 text-white border-primary-800">
              <p className="text-xs text-primary-100">รับสุทธิ</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(payrollSummary?.net_pay || 0)}</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-primary-600" />
                <h2 className="text-lg font-semibold text-slate-900">ตัวเลขที่ระบบดึงมาใช้</h2>
              </div>
              {payrollSummary ? (
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">จำนวนกะ</p><p className="text-xl font-bold text-slate-900">{payrollSummary.scheduled_days}</p></div>
                  <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">วันทำงานจริง</p><p className="text-xl font-bold text-emerald-900">{payrollSummary.worked_days}</p></div>
                  <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-700">วันมาสาย</p><p className="text-xl font-bold text-amber-900">{payrollSummary.late_days}</p></div>
                  <div className="rounded-xl bg-red-50 p-3"><p className="text-xs text-red-700">วันขาด</p><p className="text-xl font-bold text-red-900">{payrollSummary.absent_days}</p></div>
                  <div className="rounded-xl bg-orange-50 p-3"><p className="text-xs text-orange-700">วันลา</p><p className="text-xl font-bold text-orange-900">{payrollSummary.leave_days}</p></div>
                  <div className="rounded-xl bg-blue-50 p-3"><p className="text-xs text-blue-700">ชั่วโมงทำงาน</p><p className="text-xl font-bold text-blue-900">{formatMinutesAsHours(payrollSummary.total_worked_minutes)}</p></div>
                </div>
              ) : <p className="text-sm text-slate-500 mt-4">เลือกพนักงานเพื่อเริ่มคำนวณ</p>}
            </Card>

            <Card>
              <div className="flex items-center gap-2">
                <ReceiptText className="w-5 h-5 text-primary-600" />
                <h2 className="text-lg font-semibold text-slate-900">สรุปรายการบวก-หัก</h2>
              </div>
              <div className="space-y-3 mt-4">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span className="text-sm text-slate-600">ค่าจ้างพื้นฐาน</span><span className="font-semibold text-slate-900">{formatCurrency(payrollSummary?.gross_pay || 0)}</span></div>
                <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-3"><span className="text-sm text-emerald-700">OT เพิ่ม</span><span className="font-semibold text-emerald-900">+ {formatCurrency(payrollSummary?.ot_pay || 0)}</span></div>
                <div className="flex items-center justify-between rounded-xl bg-amber-50 p-3"><span className="text-sm text-amber-700">หักสาย</span><span className="font-semibold text-amber-900">- {formatCurrency(payrollSummary?.late_deduction || 0)}</span></div>
                <div className="flex items-center justify-between rounded-xl bg-red-50 p-3"><span className="text-sm text-red-700">หักขาด</span><span className="font-semibold text-red-900">- {formatCurrency(payrollSummary?.absence_deduction || 0)}</span></div>
                <div className="flex items-center justify-between rounded-xl bg-orange-50 p-3"><span className="text-sm text-orange-700">หักลา</span><span className="font-semibold text-orange-900">- {formatCurrency(payrollSummary?.leave_deduction || 0)}</span></div>
              </div>
            </Card>
          </div>

          <Card>
            <h2 className="text-lg font-semibold text-slate-900">ตารางคำนวณรายวัน</h2>
            {payrollSummary ? (
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-left min-w-[880px]">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-slate-400 border-b border-slate-200">
                      <th className="px-3 py-3">วันที่</th>
                      <th className="px-3 py-3">กะ</th>
                      <th className="px-3 py-3">เช็กอิน</th>
                      <th className="px-3 py-3">เช็กเอาต์</th>
                      <th className="px-3 py-3">ชั่วโมงทำงาน</th>
                      <th className="px-3 py-3">สาย</th>
                      <th className="px-3 py-3">OT</th>
                      <th className="px-3 py-3">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payrollSummary.daily_summaries.map((summary) => (
                      <tr key={summary.work_date}>
                        <td className="px-3 py-3 text-sm text-slate-700">{summary.work_date}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">{summary.shift?.shift_name || '-'}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">{summary.checkIn ? new Date(summary.checkIn.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">{summary.checkOut ? new Date(summary.checkOut.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">{formatMinutesAsHours(summary.worked_minutes)}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">{summary.late_minutes > 0 ? `${summary.late_minutes} นาที` : '-'}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">{summary.ot_minutes > 0 ? formatMinutesAsHours(summary.ot_minutes) : '-'}</td>
                        <td className="px-3 py-3">
                          <Badge variant={summary.absent ? 'danger' : summary.leave_day ? 'warning' : summary.has_check_in ? 'success' : 'default'}>
                            {summary.absent ? 'ขาดงาน' : summary.leave_day ? 'ลา' : summary.has_check_in ? ATTENDANCE_STATUS_LABELS[summary.checkOut ? 'checked_out' : summary.late_minutes > 0 ? 'late' : 'checked_in'] : 'ไม่มีกะ'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-slate-500 mt-4">ยังไม่มีข้อมูลพอสำหรับคำนวณ</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
