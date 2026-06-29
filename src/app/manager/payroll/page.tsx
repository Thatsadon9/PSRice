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
import { useTaskStore } from '@/store/taskStore';
import { ATTENDANCE_STATUS_LABELS, COMPENSATION_TYPE_LABELS } from '@/lib/constants';
import { format } from 'date-fns';
import { exportToCSV } from '@/lib/export';
import { buildPayrollSummary, formatMinutesAsHours, getMonthDateRange, toNumberValue } from '@/lib/hr';
import type { CompensationProfile } from '@/lib/types';
import { AlertTriangle, Calculator, ReceiptText, Save, WalletCards, DollarSign, TrendingUp, ArrowRight, Zap, Users, Search, Download, ChevronRight, PlusCircle, MinusCircle } from 'lucide-react';

interface ManualAdjustment {
  bonus: number;
  deduction: number;
}

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
    late_deduction_rate: 1,
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
  const taskStore = useTaskStore();
  const branchStore = useBranchStore();
  const employeeStore = useEmployeeStore();
  const {
    branchPolicies,
    employeeRequests,
    fetchInitialData,
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
  const [manualAdjustments, setManualAdjustments] = useState<Record<string, ManualAdjustment>>({});
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'overview' | 'detail'>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  const activeBranchId = selectedBranchId || currentUser?.branch_id || branchStore.branches[0]?.id || '';
  const branchEmployees = employeeStore.getEmployees().filter((user) => !activeBranchId || user.branch_id === activeBranchId);
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

  const branchSummaries = useMemo(() => {
    return branchEmployees.map((employee) => {
      const profile = getCompensationProfile(employee.id);
      const adj = manualAdjustments[employee.id] || { bonus: 0, deduction: 0 };
      const currentForm = activeEmployeeId === employee.id ? formDrafts[employee.id] : null;
      const previewProfile: CompensationProfile | null = currentForm
        ? {
            user_id: employee.id,
            ...currentForm,
            id: 'preview',
            created_at: '',
            updated_at: '',
          }
        : null;

      return buildPayrollSummary({
        user: employee,
        startDate: rangeStart,
        endDate: rangeEnd,
        records: attendanceStore.records.filter((record) => record.user_id === employee.id),
        assignments: shiftAssignments,
        branchPolicies,
        requests: employeeRequests.filter((request) => request.user_id === employee.id),
        tasks: taskStore.tasks.filter((task) => task.assigned_to === employee.id),
        taskTemplates: taskStore.templates,
        compensationProfile: profile
          ? {
              ...profile,
              pay_type: currentForm?.pay_type || profile.pay_type,
              base_rate: currentForm?.base_rate ?? profile.base_rate,
              ot_rate: currentForm?.ot_rate ?? profile.ot_rate,
              late_deduction_rate: currentForm?.late_deduction_rate ?? profile.late_deduction_rate,
              absence_deduction_rate: currentForm?.absence_deduction_rate ?? profile.absence_deduction_rate,
              leave_deduction_rate: currentForm?.leave_deduction_rate ?? profile.leave_deduction_rate,
            }
          : previewProfile,
        manualAdjustments: adj,
      });
    });
  }, [branchEmployees, activeEmployeeId, formDrafts, rangeStart, rangeEnd, attendanceStore.records, shiftAssignments, branchPolicies, employeeRequests, taskStore.tasks, taskStore.templates, getCompensationProfile, manualAdjustments]);

  const filteredSummaries = useMemo(() => {
    if (!searchQuery) return branchSummaries;
    return branchSummaries.filter(s => {
      const emp = branchEmployees.find(e => e.id === s.user_id);
      return emp?.full_name.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [branchSummaries, searchQuery, branchEmployees]);

  const payrollSummary = branchSummaries.find(s => s.user_id === activeEmployeeId) || null;

  const branchTotals = useMemo(() => {
    return branchSummaries.reduce((acc, s) => ({
      earnings: acc.earnings + s.total_earnings,
      extra: acc.extra + s.ot_pay + s.task_reward + s.attendance_reward + s.expense_reimbursement + s.manual_bonus,
      deductions: acc.deductions + s.total_deductions,
      net: acc.net + s.net_pay,
      count: acc.count + 1
    }), { earnings: 0, extra: 0, deductions: 0, net: 0, count: 0 });
  }, [branchSummaries]);

  const updateForm = (updates: Partial<CompensationFormState>) => {
    setFormDrafts((current) => ({
      ...current,
      [activeEmployeeId]: {
        ...(current[activeEmployeeId] || defaultForm),
        ...updates,
      },
    }));
  };

  const updateManualAdjustment = (userId: string, updates: Partial<ManualAdjustment>) => {
    setManualAdjustments(current => ({
      ...current,
      [userId]: {
        ...(current[userId] || { bonus: 0, deduction: 0 }),
        ...updates
      }
    }));
  };

  const handleSaveProfile = async () => {
    if (!selectedEmployee) {
      return;
    }

    setSaving(true);
    const success = await upsertCompensationProfile({
      id: selectedProfile?.id,
      user_id: selectedEmployee.id,
      pay_type: form.pay_type,
      base_rate: toNumberValue(form.base_rate, 0),
      ot_rate: toNumberValue(form.ot_rate, 0),
      late_deduction_rate: toNumberValue(form.late_deduction_rate, 1),
      absence_deduction_rate: toNumberValue(form.absence_deduction_rate, 0),
      leave_deduction_rate: toNumberValue(form.leave_deduction_rate, 0),
    });
    
    if (success) {
      // Clear form draft after successful save
      setFormDrafts(current => {
        const next = { ...current };
        delete next[selectedEmployee.id];
        return next;
      });
    }
    setSaving(false);
  };

  const handleExportCSV = () => {
    if (branchSummaries.length === 0) return;
    
    const rows = branchSummaries.map(s => {
      const emp = branchEmployees.find(e => e.id === s.user_id);
      return {
        'ชื่อ-นามสกุล': emp?.full_name || '',
        'รหัสพนักงาน': emp?.id || '',
        'รูปแบบการจ้าง': COMPENSATION_TYPE_LABELS[s.daily_summaries[0]?.shift ? 'daily' : 'monthly'] || '',
        'อัตราพื้นฐาน': s.gross_pay - s.ot_pay,
        'วันที่มาทำงาน': s.worked_days,
        'วันที่ขาด': s.absent_days,
        'ระยะเวลาสาย': formatMinutesAsHours(s.total_late_minutes),
        'ค่าล่วงเวลา (OT)': s.ot_pay,
        'โบนัสเช็คอิน': s.attendance_reward,
        'โบนัสงานที่อนุมัติ': s.task_reward,
        'เบิกค่าใช้จ่ายที่อนุมัติ': s.expense_reimbursement,
        'โบนัสพิเศษ': s.manual_bonus,
        'เบิกเงินล่วงหน้า': s.advance_deduction,
        'รายการหักรวม': s.total_deductions,
        'ยอดจ่ายสุทธิ': s.net_pay
      };
    });
    
    exportToCSV(rows, `payroll_${activeBranchId}_${rangeStart}_${rangeEnd}`);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20 max-w-[1600px] mx-auto overflow-hidden">
      {/* Header section with high-impact visuals */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-100 pb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
             <div className="h-12 w-12 rounded-2xl bg-slate-900 flex items-center justify-center text-primary-400 shadow-xl shadow-slate-200">
                <Calculator className="w-6 h-6 fill-primary-400/20" />
             </div>
             <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">ศูนย์ควบคุมการจ่ายค่าแรง</h1>
                <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">ข้อมูลธุรกรรมทางการเงิน • {format(new Date(), 'yyyy')}</p>
             </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-[2rem] md:rounded-full border border-slate-100 shadow-sm self-start md:self-auto">
          <div className="flex items-center gap-2 px-4 border-r border-slate-100 mr-2">
             <div className="flex bg-slate-100 p-1 rounded-full">
                <button 
                  type="button"
                  onClick={() => setViewMode('overview')}
                  className={`
                    inline-flex min-h-10 items-center justify-center rounded-full px-4 py-1.5 text-[10px] font-black uppercase transition-all
                    touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
                    ${viewMode === 'overview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}
                  `}
                >
                  <Users className="w-3.5 h-3.5 inline mr-1.5" /> ภาพรวมสาขา
                </button>
                <button 
                  type="button"
                  onClick={() => setViewMode('detail')}
                  className={`
                    inline-flex min-h-10 items-center justify-center rounded-full px-4 py-1.5 text-[10px] font-black uppercase transition-all
                    touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
                    ${viewMode === 'detail' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}
                  `}
                >
                  <Search className="w-3.5 h-3.5 inline mr-1.5" /> รายบุคคล
                </button>
             </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="rounded-full font-black text-[10px] uppercase border-slate-200 text-slate-600"
            onClick={() => {
              // Implementation of recalculate - essentially just triggering a re-render/re-compute
              attendanceStore.fetchRecords();
              void fetchInitialData();
            }}
          >
             <Calculator className="w-3.5 h-3.5 mr-2" /> คำนวณใหม่
          </Button>
          <Button 
            variant="secondary" 
            size="sm" 
            className="rounded-full font-black text-[10px] uppercase bg-slate-100"
            onClick={handleExportCSV}
            disabled={branchSummaries.length === 0}
          >
             <Download className="w-3.5 h-3.5 mr-2" /> ส่งออก CSV
          </Button>
        </div>
      </div>

      {!schemaReady && (
        <Card statusColor="amber" className="bg-amber-50/60 border-amber-100 rounded-[2rem]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-black text-amber-900 uppercase tracking-tight">ต้องตั้งค่าระบบเริ่มต้น</p>
              <p className="text-xs text-amber-800 mt-1">{schemaMessage}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Configuration Sidebar */}
        <div className="xl:col-span-3 space-y-6 sticky top-24 min-w-0">
          <Card className="rounded-[2.5rem] border-slate-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-6">
               <div className="p-2.5 bg-primary-50 text-primary-600 rounded-xl">
                 <WalletCards className="w-5 h-5" />
               </div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">ตั้งค่าอัตราค่าแรง</h2>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ขอบเขตการเลือก</label>
                 <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                   <Select label="สาขา" options={branchStore.branches.map((b) => ({ value: b.id, label: b.name }))} value={activeBranchId} onChange={(e) => { setSelectedBranchId(e.target.value); setSelectedEmployeeId(''); }} />
                   <Select label="พนักงาน" options={branchEmployees.map((e) => ({ value: e.id, label: e.full_name }))} value={activeEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} disabled={branchEmployees.length === 0} />
                 </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-50">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ช่วงเวลา</label>
                <div className="grid grid-cols-1 gap-2">
                  <Input label="เริ่ม" type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
                  <Input label="สิ้นสุด" type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-50">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">อัตราค่าแรงหลัก (บาท)</label>
                <Select label="รูปแบบการจ่าย" options={[{ value: 'daily', label: COMPENSATION_TYPE_LABELS.daily }, { value: 'hourly', label: COMPENSATION_TYPE_LABELS.hourly }, { value: 'monthly', label: COMPENSATION_TYPE_LABELS.monthly }]} value={form.pay_type} onChange={(e) => updateForm({ pay_type: e.target.value as CompensationProfile['pay_type'] })} />
                <Input label="อัตราพื้นฐาน" type="number" value={form.base_rate} onChange={(e) => updateForm({ base_rate: Number(e.target.value) })} />
                <Input label="ค่าล่วงเวลา (OT)/ชม." type="number" value={form.ot_rate} onChange={(e) => updateForm({ ot_rate: Number(e.target.value) })} />
              </div>
      
              <div className="space-y-3 pt-4 border-t border-slate-50">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">รายการหักเงิน</label>
                <div className="grid grid-cols-2 gap-2">
                   <Input label="สาย (นาทีละ)" type="number" value={form.late_deduction_rate} onChange={(e) => updateForm({ late_deduction_rate: Number(e.target.value) })} />
                   <Input label="ขาดงาน (วันละ)" type="number" value={form.absence_deduction_rate} onChange={(e) => updateForm({ absence_deduction_rate: Number(e.target.value) })} />
                </div>
              </div>

              <Button fullWidth className="h-14 rounded-2xl shadow-xl shadow-primary-900/10 transition-all active:scale-95" onClick={() => void handleSaveProfile()} loading={saving} icon={<Save className="w-4 h-4 ml-2" />}>ปรับใช้อัตราค่าแรง</Button>
            </div>
          </Card>
          
          <div className="p-5 rounded-[2rem] bg-slate-900 text-white shadow-2xl space-y-3">
             <div className="flex items-center gap-2 mb-2">
                <div className="h-2 w-2 rounded-full bg-primary-400 animate-pulse" />
                 <span className="text-[9px] font-black uppercase tracking-widest text-primary-400">เกณฑ์การคำนวณ</span>
             </div>
             <p className="text-[11px] font-medium text-slate-400 leading-relaxed italic">
               &ldquo;ค่าจ้างพื้นฐานคำนวณจาก {form.pay_type === 'hourly' ? 'นาทีที่ทำงานจริง' : form.pay_type === 'monthly' ? 'การทำงานเต็มเดือน' : 'กะงานที่ได้รับอนุมัติในระบบ'} รายการหักเงินจะถูกคำนวณอัตโนมัติจากบันทึกการลงเวลา&rdquo;
             </p>
          </div>
        </div>

        {/* Right Column: Dashboard & Details */}
        <div className="xl:col-span-9 space-y-8 min-w-0">
          
          {/* Dashboard Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="group p-8 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm transition-all hover:shadow-xl hover:-translate-y-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
                {viewMode === 'overview' ? 'ยอดรวมสาขาก่อนหัก' : 'ยอดรวมพนักงานก่อนหัก'}
              </p>
              <div className="flex items-end justify-between">
                <div>
                   <p className="text-4xl font-black text-slate-900 tracking-tighter">
                     {formatCurrency(viewMode === 'overview' ? branchTotals.earnings : (payrollSummary?.total_earnings || 0))}
                   </p>
                   <div className="mt-4 flex items-center gap-2 bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full w-fit">
                      {viewMode === 'overview' ? <Users className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                       <span className="text-[10px] font-black uppercase">
                         {viewMode === 'overview' ? `${branchTotals.count} พนักงาน` : 'รอบปัจจุบัน'}
                       </span>
                   </div>
                </div>
                <div className="h-16 w-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-200 group-hover:bg-primary-50 group-hover:text-primary-400 transition-colors">
                   <DollarSign className="w-8 h-8" />
                </div>
              </div>
            </div>

            <div className="p-8 rounded-[2.5rem] bg-emerald-600 shadow-2xl shadow-emerald-900/10 text-white relative overflow-hidden group">
              <div className="absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 h-32 w-32 bg-white/10 rounded-full blur-3xl" />
              <p className="text-[10px] font-black text-emerald-100 uppercase tracking-[0.2em] mb-4">
                {viewMode === 'overview' ? 'รายได้เพิ่มรวมสาขา' : 'รายได้เพิ่มรวมพนักงาน'}
              </p>
              <div className="flex items-end justify-between relative z-10">
                <div>
                   <p className="text-4xl font-black text-white tracking-tighter">
                     +{formatCurrency(viewMode === 'overview' ? branchTotals.extra : ((payrollSummary?.ot_pay || 0) + (payrollSummary?.task_reward || 0) + (payrollSummary?.attendance_reward || 0) + (payrollSummary?.expense_reimbursement || 0) + (payrollSummary?.manual_bonus || 0)))}
                   </p>
                   <p className="mt-4 text-[10px] font-bold text-emerald-200 uppercase tracking-widest">
                     {viewMode === 'overview' ? 'OT + โบนัสงาน + เบิกค่าใช้จ่าย' : 'OT + เช็คอิน + งาน + ค่าใช้จ่าย'}
                   </p>
                </div>
                <div className="h-16 w-16 bg-white/10 rounded-3xl flex items-center justify-center text-emerald-100 transition-transform group-hover:rotate-12">
                   <TrendingUp className="w-8 h-8" />
                </div>
              </div>
            </div>

            <div className="p-8 rounded-[2.5rem] bg-slate-900 shadow-2xl shadow-slate-900/20 text-white group">
              <p className="text-[10px] font-black text-primary-400 uppercase tracking-[0.2em] mb-4">
                {viewMode === 'overview' ? 'ยอดจ่ายสุทธิรวม' : 'ยอดจ่ายสุทธิ'}
              </p>
              <div className="flex items-end justify-between">
                <div>
                   <p className="text-4xl font-black text-white tracking-tighter">
                     {formatCurrency(viewMode === 'overview' ? branchTotals.net : (payrollSummary?.net_pay || 0))}
                   </p>
                   <div className="mt-4 flex items-center gap-1.5 text-primary-400">
                      <Zap className="w-3.5 h-3.5 fill-primary-400" />
                       <span className="text-[10px] font-black uppercase tracking-widest">
                         {viewMode === 'overview' ? 'รวมสุทธิทั้งสาขา' : 'คำนวณยอดสุทธิแล้ว'}
                       </span>
                   </div>
                </div>
                <div className="h-16 w-16 bg-white/5 rounded-3xl flex items-center justify-center text-primary-400 group-hover:scale-110 transition-transform">
                   <ReceiptText className="w-8 h-8" />
                </div>
              </div>
            </div>
          </div>

          {viewMode === 'overview' ? (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
               <Card className="rounded-[2.5rem] border-slate-100 shadow-sm overflow-hidden p-0">
                  <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/30">
                     <div className="space-y-1">
                        <h2 className="text-xl font-black text-slate-900">รายการค่าแรงรวมทั้งสาขา</h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[.2em]">รายการสรุปตามรอบเวลาที่เลือก</p>
                     </div>
                     <div className="relative w-full md:w-72">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                           type="text" 
                           placeholder="ค้นหาชื่อพนักงาน..."
                           value={searchQuery}
                           onChange={(e) => setSearchQuery(e.target.value)}
                           className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none"
                        />
                     </div>
                  </div>

                  <div className="overflow-x-auto">
                     <table className="w-full text-left min-w-[1200px]">
                        <thead>
                           <tr className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 bg-slate-50/50">
                              <th className="px-8 py-5">พนักงาน</th>
                              <th className="px-6 py-5">ประเภท / เรท</th>
                              <th className="px-6 py-5">มา / ขาด / สาย</th>
                              <th className="px-6 py-5">ค่าจ้าง + OT</th>
                              <th className="px-6 py-5">เงินเพิ่ม/หักพิเศษ</th>
                              <th className="px-6 py-5 text-right px-8">รับสุทธิ</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                           {filteredSummaries.map((s) => {
                              const emp = branchEmployees.find(e => e.id === s.user_id);
                              if (!emp) return null;
                              return (
                                 <tr key={s.user_id} className="group hover:bg-slate-50 transition-colors">
                                    <td className="px-8 py-6">
                                       <div className="flex items-center gap-4">
                                          <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-400">
                                             {emp.full_name.charAt(0)}
                                          </div>
                                          <div className="flex flex-col">
                                             <span className="text-sm font-black text-slate-900">{emp.full_name}</span>
                                             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{emp.id}</span>
                                          </div>
                                       </div>
                                    </td>
                                    <td className="px-6 py-6">
                                       <div className="space-y-1">
                                          <Badge variant="default" className="text-[9px] uppercase font-black">{COMPENSATION_TYPE_LABELS[s.daily_summaries[0]?.shift ? 'daily' : 'monthly']}</Badge>
                                          <p className="text-[10px] font-bold text-slate-500">@{formatCurrency(s.gross_pay / (s.worked_days || 1))}/วัน</p>
                                       </div>
                                    </td>
                                    <td className="px-6 py-6">
                                       <div className="flex items-center gap-4">
                                          <div className="text-center">
                                             <p className="text-xs font-black text-slate-900">{s.worked_days}</p>
                                             <p className="text-[9px] font-bold text-slate-400 uppercase">มา</p>
                                          </div>
                                          <div className="text-center">
                                             <p className="text-xs font-black text-red-500">{s.absent_days}</p>
                                             <p className="text-[9px] font-bold text-slate-400 uppercase">ขาด</p>
                                          </div>
                                          <div className="text-center">
                                             <p className="text-xs font-black text-amber-500">{s.total_late_minutes}</p>
                                             <p className="text-[9px] font-bold text-slate-400 uppercase">สาย</p>
                                          </div>
                                       </div>
                                    </td>
                                    <td className="px-6 py-6">
                                       <div className="space-y-1">
                                          <p className="text-sm font-black text-slate-900">{formatCurrency(s.gross_pay)}</p>
                                          <p className="text-[10px] font-bold text-emerald-600">OT: {formatCurrency(s.ot_pay)}</p>
                                       </div>
                                    </td>
                                    <td className="px-6 py-6">
                                       <div className="flex flex-col gap-2">
                                          <div className="flex items-center gap-2">
                                             <PlusCircle className="w-3.5 h-3.5 text-emerald-500" />
                                             <input 
                                                type="number"
                                                placeholder="โบนัส"
                                                value={manualAdjustments[s.user_id]?.bonus || ''}
                                                onChange={(e) => updateManualAdjustment(s.user_id, { bonus: Number(e.target.value) })}
                                                className="w-16 text-[10px] font-black border-b border-slate-200 focus:border-primary-500 outline-none p-0.5"
                                             />
                                          </div>
                                          <div className="flex items-center gap-2">
                                             <MinusCircle className="w-3.5 h-3.5 text-red-500" />
                                             <input 
                                                type="number"
                                                placeholder="หัก"
                                                value={manualAdjustments[s.user_id]?.deduction || ''}
                                                onChange={(e) => updateManualAdjustment(s.user_id, { deduction: Number(e.target.value) })}
                                                className="w-16 text-[10px] font-black border-b border-slate-200 focus:border-red-500 outline-none p-0.5"
                                             />
                                          </div>
                                       </div>
                                    </td>
                                    <td className="px-6 py-6 text-right px-8">
                                       <div className="flex items-center justify-end gap-3">
                                          <p className="text-lg font-black text-slate-900">{formatCurrency(s.net_pay)}</p>
                                          <button 
                                             onClick={() => { setSelectedEmployeeId(s.user_id); setViewMode('detail'); }}
                                             className="p-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
                                          >
                                             <ChevronRight className="w-4 h-4" />
                                          </button>
                                       </div>
                                    </td>
                                 </tr>
                              );
                           })}
                        </tbody>
                     </table>
                  </div>
               </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-left-4 duration-500">
               {/* ข้อมูลการทำงาน (Automated Metrics) */}
               <Card className="rounded-[2.5rem] p-8 border-slate-100 shadow-sm relative overflow-hidden">
                 <div className="flex items-center justify-between mb-8">
                   <div className="flex items-center gap-3">
                     <div className="p-3 bg-primary-50 text-primary-600 rounded-2xl">
                       <Calculator className="w-6 h-6" />
                     </div>
                     <h2 className="text-sm font-black text-slate-900 uppercase tracking-[.2em]">ข้อมูลพื้นฐานการทำงาน</h2>
                   </div>
                   <span className="text-[10px] font-black text-slate-300 uppercase tracking-[.2em]">บันทึกที่ตรวจสอบแล้ว</span>
                 </div>
                 
                 {payrollSummary ? (
                   <div className="grid grid-cols-2 gap-4">
                     <div className="rounded-3xl bg-slate-50 p-6 border border-slate-100 hover:bg-white transition-colors">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">วันที่มีในตาราง</p>
                        <p className="text-3xl font-black text-slate-900">{payrollSummary.scheduled_days}<span className="text-sm ml-1 text-slate-400">วัน</span></p>
                     </div>
                     <div className="rounded-3xl bg-emerald-50 p-6 border border-emerald-100">
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">จำนวนกะที่ทำ</p>
                        <p className="text-3xl font-black text-emerald-900">{payrollSummary.worked_days}</p>
                     </div>
                     <div className="rounded-3xl bg-amber-50 p-6 border border-amber-100">
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">จำนวนครั้งที่สาย</p>
                        <p className="text-3xl font-black text-amber-900">{payrollSummary.late_days}</p>
                     </div>
                     <div className="rounded-3xl bg-blue-50 p-6 border border-blue-100">
                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">ชั่วโมงรวม</p>
                        <p className="text-3xl font-black text-blue-900">{formatMinutesAsHours(payrollSummary.total_worked_minutes)}</p>
                     </div>
                     <div className="rounded-3xl bg-red-50 p-6 border border-red-100">
                        <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">ขาดงาน</p>
                        <p className="text-3xl font-black text-red-900">{payrollSummary.absent_days}</p>
                     </div>
                     <div className="rounded-3xl bg-orange-50 p-6 border border-orange-100">
                        <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1">การลาที่อนุมัติ</p>
                        <p className="text-3xl font-black text-orange-900">{payrollSummary.leave_days}</p>
                     </div>
                   </div>
                 ) : (
                   <div className="h-48 flex items-center justify-center text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                      <p className="text-sm font-bold text-slate-400">เลือกพนักงานเพื่อดึงข้อมูลการทำงาน</p>
                   </div>
                 )}
               </Card>

               {/* รายการปรับปรุง (Adjustment Ledger) */}
               <Card className="rounded-[2.5rem] p-8 border-slate-100 shadow-sm flex flex-col">
                 <div className="flex items-center justify-between mb-8">
                   <div className="flex items-center gap-3">
                     <div className="p-3 bg-primary-900 text-white rounded-2xl">
                       <ReceiptText className="w-6 h-6" />
                     </div>
                     <h2 className="text-sm font-black text-slate-900 uppercase tracking-[.2em]">บัญชีรายการปรับปรุงประจำงวด</h2>
                   </div>
                   <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-primary-600 uppercase bg-primary-50 px-3 py-1 rounded-full">สรุปยอดแล้ว</span>
                   </div>
                 </div>

                 <div className="flex-1 space-y-4">
                   <div className="flex items-center justify-between p-5 rounded-3xl bg-slate-50 border border-slate-100 transition-all hover:bg-white">
                      <div className="flex items-center gap-3">
                         <div className="h-10 w-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-400"><DollarSign className="w-5 h-5"/></div>
                          <span className="text-sm font-bold text-slate-700">ค่าจ้างพื้นฐานประจำงวด</span>
                      </div>
                      <span className="text-lg font-black text-slate-900">{formatCurrency(payrollSummary?.gross_pay || 0)}</span>
                   </div>
                   
                   <div className="flex items-center justify-between p-5 rounded-3xl bg-emerald-50 border border-emerald-100">
                      <div className="flex items-center gap-3">
                         <div className="h-10 w-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-emerald-500"><TrendingUp className="w-5 h-5"/></div>
                          <span className="text-sm font-bold text-emerald-900 uppercase tracking-tight">โบนัสค่าล่วงเวลา</span>
                      </div>
                      <span className="text-lg font-black text-emerald-700 tracking-tight">+ {formatCurrency(payrollSummary?.ot_pay || 0)}</span>
                   </div>

                   <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                     <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                       <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">โบนัสเช็คอิน</p>
                       <p className="mt-2 text-base font-black text-emerald-800">+ {formatCurrency(payrollSummary?.attendance_reward || 0)}</p>
                     </div>
                     <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                       <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">งานที่อนุมัติ</p>
                       <p className="mt-2 text-base font-black text-emerald-800">+ {formatCurrency(payrollSummary?.task_reward || 0)}</p>
                     </div>
                     <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                       <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">เบิกค่าใช้จ่าย</p>
                       <p className="mt-2 text-base font-black text-emerald-800">+ {formatCurrency(payrollSummary?.expense_reimbursement || 0)}</p>
                     </div>
                   </div>

                   <div className="space-y-2 py-4 border-y border-slate-50">
                     <div className="flex items-center justify-between px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">รายการหักเงินอัตโนมัติ</div>
                     <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors">
                        <span className="text-xs font-bold text-slate-500">การเข้างานสาย</span>
                        <span className="text-xs font-black text-red-500 leading-none">- {formatCurrency(payrollSummary?.late_deduction || 0)}</span>
                     </div>
                     <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors">
                        <span className="text-xs font-bold text-slate-500">ค่าปรับการขาดงาน</span>
                        <span className="text-xs font-black text-red-500 leading-none">- {formatCurrency(payrollSummary?.absence_deduction || 0)}</span>
                     </div>
                     <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors">
                        <span className="text-xs font-bold text-slate-500">การลาแบบไม่รับค่าจ้าง</span>
                        <span className="text-xs font-black text-red-500 leading-none">- {formatCurrency(payrollSummary?.leave_deduction || 0)}</span>
                     </div>
                     <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors">
                        <span className="text-xs font-bold text-slate-500">เบิกเงินล่วงหน้าที่อนุมัติ</span>
                        <span className="text-xs font-black text-red-500 leading-none">- {formatCurrency(payrollSummary?.advance_deduction || 0)}</span>
                     </div>
                   </div>
                 </div>

                 <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
                    <div>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">รวมรายการปรับปรุง</p>
                       <p className={`text-sm font-black ${((payrollSummary?.net_pay || 0) - (payrollSummary?.gross_pay || 0)) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {((payrollSummary?.net_pay || 0) - (payrollSummary?.gross_pay || 0)) >= 0 ? '+' : ''}
                          {formatCurrency((payrollSummary?.net_pay || 0) - (payrollSummary?.gross_pay || 0))}
                       </p>
                    </div>
                    <div className="h-12 w-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
                       <ArrowRight className="w-5 h-5" />
                    </div>
                 </div>
               </Card>
               
               <div className="lg:col-span-2">
                 <Card className="rounded-[3rem] border-slate-100 shadow-sm overflow-hidden p-0">
                   <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                     <div className="space-y-1">
                        <h2 className="text-xl font-black text-slate-900">รายละเอียดรายวัน</h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[.2em]">บันทึกการทำงาน</p>
                     </div>
                     <Button size="sm" variant="outline" className="rounded-full border-slate-200 text-slate-500 text-[10px] font-black uppercase">คัดกรอง</Button>
                   </div>

                   {payrollSummary ? (
                     <div className="overflow-x-auto">
                       <table className="w-full text-left min-w-[1000px]">
                         <thead>
                           <tr className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 bg-slate-50/50">
                             <th className="px-8 py-5">วันที่ทำงาน</th>
                             <th className="px-6 py-5">กะงานที่ได้รับ</th>
                             <th className="px-6 py-5">บันทึกเวลา (เข้า/ออก)</th>
                             <th className="px-6 py-5">ระยะเวลาทำงาน</th>
                             <th className="px-6 py-5">ส่วนต่าง (สาย)</th>
                             <th className="px-6 py-5 text-right px-8">สถานะตรวจสอบ</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                           {payrollSummary.daily_summaries.map((summary) => (
                             <tr key={summary.work_date} className="group hover:bg-slate-100/30 transition-colors">
                               <td className="px-8 py-6">
                                  <div className="flex flex-col">
                                     <span className="text-sm font-black text-slate-900">{summary.work_date}</span>
                                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{format(new Date(summary.work_date), 'EEEE')}</span>
                                  </div>
                               </td>
                               <td className="px-6 py-6 font-bold text-slate-600 text-sm">
                                  {summary.shift ? (
                                    <div className="flex items-center gap-2">
                                      <div className="h-2 w-2 rounded-full bg-primary-400" />
                                      {summary.shift.shift_name}
                                    </div>
                                  ) : <span className="text-slate-300 italic opacity-50">ไม่มี</span>}
                               </td>
                               <td className="px-6 py-6">
                                  <div className="flex items-center gap-2">
                                     <div className={`px-2 py-1 rounded-lg text-[10px] font-black ${summary.checkIn ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                        {summary.checkIn ? new Date(summary.checkIn.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                     </div>
                                     <ArrowRight className="w-3 h-3 text-slate-300" />
                                     <div className={`px-2 py-1 rounded-lg text-[10px] font-black ${summary.checkOut ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                        {summary.checkOut ? new Date(summary.checkOut.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                     </div>
                                  </div>
                               </td>
                               <td className="px-6 py-6">
                                  <span className="text-sm font-black text-slate-700">{formatMinutesAsHours(summary.worked_minutes)}</span>
                               </td>
                               <td className="px-6 py-6">
                                  {summary.late_minutes > 0 ? (
                                    <span className="text-xs font-black text-amber-600">สาย {formatMinutesAsHours(summary.late_minutes)}</span>
                                  ) : <span className="text-xs font-bold text-slate-300">—</span>}
                               </td>
                               <td className="px-6 py-6 text-right px-8">
                                 <Badge variant={summary.absent ? 'danger' : summary.leave_day ? 'warning' : summary.has_check_in ? 'success' : 'default'} className="font-black text-[9px] uppercase tracking-tighter">
                                   {summary.absent ? 'ขาดงาน' : summary.leave_day ? 'อนุมัติลาแล้ว' : summary.has_check_in ? ATTENDANCE_STATUS_LABELS[summary.checkOut ? 'checked_out' : summary.late_minutes > 0 ? 'late' : 'checked_in'] : 'ไม่มีตารางงาน'}
                                 </Badge>
                               </td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                   ) : (
                     <div className="p-20 text-center">
                        <div className="flex flex-col items-center gap-4">
                           <ReceiptText className="w-16 h-16 text-slate-100" />
                           <p className="text-sm font-black text-slate-300 uppercase tracking-widest">โปรดระบุขอบเขตเพื่อดูรายละเอียดงาน</p>
                        </div>
                     </div>
                   )}
                 </Card>
               </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
