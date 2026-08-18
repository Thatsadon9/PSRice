'use client';
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useBranchStore } from '@/store/branchStore';
import { supabase } from '@/lib/supabase';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import UnitRewardFields from '@/components/tasks/UnitRewardFields';
import { PROOF_SELECT_OPTIONS } from '@/components/ui/proofSelectOptions';
import { PRIORITY_SELECT_OPTIONS } from '@/components/ui/prioritySelectOptions';
import { 
  CalendarCheck, Plus, Calendar,
  Building2, ClipboardList, CheckCircle2,
  User, AlertTriangle, Send, Camera, Zap, Clock, Users,
  Filter, RotateCcw, Search, X, Trash2
} from 'lucide-react';
import { PRIORITY_LABELS, PROOF_TYPE_LABELS } from '@/lib/constants';
import { formatThaiDate, getCurrentDateStr, isSameCalendarDate } from '@/lib/dateUtils';
import type { Priority, ProofType, RewardType, Task, TaskStatus } from '@/lib/types';

type AssignmentMode = 'template' | 'custom';
type AssignmentTarget = 'employee' | 'branch';
type DateScope = 'all' | 'today' | 'yesterday' | '7days' | 'custom';
type TableLimit = '10' | '25' | '50' | '100' | 'all';

interface AssignmentFormData {
  mode: AssignmentMode;
  template_id: string;
  title: string;
  description: string;
  priority: Priority;
  proof_type_required: ProofType;
  target_type: AssignmentTarget;
  target_id: string;
  due_date: string;
  reward_amount: string;
  reward_type: RewardType;
  unit_label: string;
  unit_rate: string;
  unit_step: string;
  unit_min: string;
  unit_max: string;
  target_quantity: string;
  requires_approval: boolean;
}

type TaskDraft = Omit<Task, 'id' | 'created_at' | 'assigned_to' | 'due_date' | 'status'>;

const ASSIGNMENT_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Waiting',
  in_progress: 'Processing',
  submitted: 'Submitted',
  approved: 'Completed',
  rejected: 'Rejected',
  overdue: 'Overdue',
};

const REWARD_TYPE_OPTIONS = [
  { value: 'fixed', label: 'เหมาจ่ายเมื่องานผ่าน' },
  { value: 'unit', label: 'คิดตามจำนวนที่ทำได้' },
];

const DATE_SCOPE_OPTIONS: { value: DateScope; label: string }[] = [
  { value: 'all', label: 'ทุกวัน' },
  { value: 'today', label: 'วันนี้' },
  { value: 'yesterday', label: 'เมื่อวาน' },
  { value: '7days', label: '7 วัน' },
  { value: 'custom', label: 'เลือกวัน' },
];

const QUICK_STATUS_OPTIONS: { value: 'all' | TaskStatus; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'pending', label: 'Waiting' },
  { value: 'in_progress', label: 'Processing' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'overdue', label: 'Overdue' },
];

const TABLE_LIMIT_OPTIONS: { value: TableLimit; label: string }[] = [
  { value: '10', label: '10 รายการ' },
  { value: '25', label: '25 รายการ' },
  { value: '50', label: '50 รายการ' },
  { value: '100', label: '100 รายการ' },
  { value: 'all', label: 'ทั้งหมด' },
];

function parseOptionalNumber(value: string) {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getDateOnly(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

function offsetDateOnly(dateOnly: string, offsetDays: number) {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offsetDays);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function getStatusVariant(status: TaskStatus) {
  if (status === 'approved') return 'success' as const;
  if (status === 'pending') return 'slate' as const;
  if (status === 'submitted') return 'warning' as const;
  if (status === 'rejected' || status === 'overdue') return 'danger' as const;
  return 'info' as const;
}

export default function AssignmentsPage() {
  const taskStore = useTaskStore();
  const employeeStore = useEmployeeStore();
  const branchStore = useBranchStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [assignmentSummary, setAssignmentSummary] = useState('');
  const [formError, setFormError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [dateScope, setDateScope] = useState<DateScope>('all');
  const [customDate, setCustomDate] = useState(getCurrentDateStr());
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [proofFilter, setProofFilter] = useState<'all' | ProofType>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [rewardTypeFilter, setRewardTypeFilter] = useState<'all' | RewardType>('all');
  const [tableLimit, setTableLimit] = useState<TableLimit>('25');
  const [searchTerm, setSearchTerm] = useState('');
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  // Assignment Form State
  const [formData, setFormData] = useState<AssignmentFormData>({
    mode: 'template',
    template_id: '',
    title: '',
    description: '',
    priority: 'medium',
    proof_type_required: 'photo',
    target_type: 'employee',
    target_id: '',
    due_date: getCurrentDateStr(),
    reward_amount: '',
    reward_type: 'fixed',
    unit_label: '',
    unit_rate: '',
    unit_step: '1',
    unit_min: '',
    unit_max: '',
    target_quantity: '',
    requires_approval: true,
  });

  const templates = taskStore.templates;
  const employees = employeeStore.getEmployees();
  const branches = branchStore.branches;
  const todayStr = getCurrentDateStr();
  const yesterdayStr = offsetDateOnly(todayStr, -1);
  const last7DaysStart = offsetDateOnly(todayStr, -6);

  const employeesById = useMemo(() => {
    return new Map(employeeStore.users.map((user) => [user.id, user]));
  }, [employeeStore.users]);

  const filteredAssignmentTasks = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return taskStore.tasks
      .slice()
      .filter((task) => {
        const taskDate = getDateOnly(task.due_date || task.created_at);
        const employee = employeesById.get(task.assigned_to);
        const branch = employee ? branchStore.getBranchById(employee.branch_id) : null;

        if (dateScope === 'today' && taskDate !== todayStr) return false;
        if (dateScope === 'yesterday' && taskDate !== yesterdayStr) return false;
        if (dateScope === '7days' && (taskDate < last7DaysStart || taskDate > todayStr)) return false;
        if (dateScope === 'custom' && taskDate !== customDate) return false;
        if (statusFilter !== 'all' && task.status !== statusFilter) return false;
        if (proofFilter !== 'all' && task.proof_type_required !== proofFilter) return false;
        if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
        if (branchFilter !== 'all' && employee?.branch_id !== branchFilter) return false;
        if (employeeFilter !== 'all' && task.assigned_to !== employeeFilter) return false;
        if (rewardTypeFilter !== 'all' && (task.reward_type || 'fixed') !== rewardTypeFilter) return false;

        if (normalizedSearch) {
          const haystack = [
            task.title,
            task.description,
            employee?.full_name,
            branch?.name,
          ].filter(Boolean).join(' ').toLowerCase();

          if (!haystack.includes(normalizedSearch)) return false;
        }

        return true;
      });
  }, [
    branchFilter,
    branchStore,
    customDate,
    dateScope,
    employeeFilter,
    employeesById,
    last7DaysStart,
    priorityFilter,
    proofFilter,
    rewardTypeFilter,
    searchTerm,
    statusFilter,
    taskStore.tasks,
    todayStr,
    yesterdayStr,
  ]);

  const displayedAssignmentTasks = tableLimit === 'all'
    ? filteredAssignmentTasks
    : filteredAssignmentTasks.slice(0, Number(tableLimit));

  const activeFilterChips = [
    searchTerm.trim()
      ? {
          key: 'search',
          label: `ค้นหา: ${searchTerm.trim()}`,
          onClear: () => setSearchTerm(''),
        }
      : null,
    dateScope !== 'all'
      ? {
          key: 'date',
          label: dateScope === 'custom'
            ? `วันที่: ${customDate}`
            : `วันที่: ${DATE_SCOPE_OPTIONS.find((option) => option.value === dateScope)?.label}`,
          onClear: () => setDateScope('all'),
        }
      : null,
    statusFilter !== 'all'
      ? {
          key: 'status',
          label: `สถานะ: ${ASSIGNMENT_STATUS_LABELS[statusFilter]}`,
          onClear: () => setStatusFilter('all'),
        }
      : null,
    proofFilter !== 'all'
      ? {
          key: 'proof',
          label: `หลักฐาน: ${PROOF_TYPE_LABELS[proofFilter]}`,
          onClear: () => setProofFilter('all'),
        }
      : null,
    priorityFilter !== 'all'
      ? {
          key: 'priority',
          label: `ความสำคัญ: ${PRIORITY_LABELS[priorityFilter]}`,
          onClear: () => setPriorityFilter('all'),
        }
      : null,
    branchFilter !== 'all'
      ? {
          key: 'branch',
          label: `สาขา: ${branches.find((branch) => branch.id === branchFilter)?.name || 'เลือกไว้'}`,
          onClear: () => {
            setBranchFilter('all');
            setEmployeeFilter('all');
          },
        }
      : null,
    employeeFilter !== 'all'
      ? {
          key: 'employee',
          label: `พนักงาน: ${employees.find((employee) => employee.id === employeeFilter)?.full_name || 'เลือกไว้'}`,
          onClear: () => setEmployeeFilter('all'),
        }
      : null,
    rewardTypeFilter !== 'all'
      ? {
          key: 'reward',
          label: rewardTypeFilter === 'unit' ? 'ค่าตอบแทน: ตามจำนวน' : 'ค่าตอบแทน: เหมาจ่าย',
          onClear: () => setRewardTypeFilter('all'),
        }
      : null,
  ].filter(Boolean) as { key: string; label: string; onClear: () => void }[];

  const activeFilterCount = activeFilterChips.length;

  const resetFilters = () => {
    setDateScope('all');
    setCustomDate(getCurrentDateStr());
    setStatusFilter('all');
    setProofFilter('all');
    setPriorityFilter('all');
    setBranchFilter('all');
    setEmployeeFilter('all');
    setRewardTypeFilter('all');
    setTableLimit('25');
    setSearchTerm('');
  };

  const openAssignmentModal = () => {
    setFormError('');
    setSuccess(false);
    setAssignmentSummary('');
    setIsModalOpen(true);
  };

  const openDeleteTask = (task: Task) => {
    setDeleteError('');
    setTaskToDelete(task);
  };

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;

    setDeleteError('');
    setDeletingTaskId(taskToDelete.id);

    try {
      const deleted = await taskStore.deleteTask(taskToDelete.id);
      if (!deleted) {
        setDeleteError('ลบงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
        return;
      }

      setTaskToDelete(null);
      await taskStore.fetchInitialData();
    } finally {
      setDeletingTaskId(null);
    }
  };

  const handleAssign = async () => {
    setFormError('');

    if (!formData.target_id) {
      setFormError('กรุณาเลือกกลุ่มเป้าหมายก่อนมอบหมายงาน');
      return;
    }
    
    let baseTaskData: TaskDraft;
    
    if (formData.mode === 'template') {
      const template = taskStore.getTemplateById(formData.template_id);
      if (!template) {
        setFormError('กรุณาเลือกต้นแบบงาน');
        return;
      }

      const overrideRewardAmount = parseOptionalNumber(formData.reward_amount);
      if (template.reward_type !== 'unit' && Number.isNaN(overrideRewardAmount)) {
        setFormError('กรุณากรอกจำนวนเงินพิเศษเป็นตัวเลข');
        return;
      }

      baseTaskData = {
        template_id: template.id,
        title: template.title,
        description: template.description,
        priority: template.priority,
        proof_type_required: template.proof_type_required,
        checklist_state: template.checklist_json?.map(item => ({ ...item })),
        reward_amount: template.reward_type === 'unit'
          ? null
          : overrideRewardAmount === null ? template.reward_amount : overrideRewardAmount,
        reward_type: template.reward_type || 'fixed',
        unit_label: template.unit_label ?? null,
        unit_rate: template.unit_rate ?? null,
        unit_step: template.unit_step ?? 1,
        unit_min: template.unit_min ?? null,
        unit_max: template.unit_max ?? null,
        target_quantity: template.target_quantity ?? null,
        requires_approval: template.requires_approval,
      };
    } else {
      const isUnitReward = formData.reward_type === 'unit';
      const rewardAmount = parseOptionalNumber(formData.reward_amount);
      const unitRate = parseOptionalNumber(formData.unit_rate);
      const unitStep = parseOptionalNumber(formData.unit_step) ?? 1;
      const unitMin = parseOptionalNumber(formData.unit_min);
      const unitMax = parseOptionalNumber(formData.unit_max);
      const targetQuantity = parseOptionalNumber(formData.target_quantity);

      if (!formData.title.trim()) {
        setFormError('กรุณากรอกหัวข้องาน');
        return;
      }

      if (!isUnitReward && Number.isNaN(rewardAmount)) {
        setFormError('กรุณากรอกค่าตอบแทนเป็นตัวเลข');
        return;
      }

      if (isUnitReward) {
        if (!formData.unit_label.trim()) {
          setFormError('กรุณาระบุชื่อหน่วย เช่น กระสอบ, ถุง, รอบ');
          return;
        }

        if (Number.isNaN(unitRate) || unitRate === null || unitRate <= 0) {
          setFormError('กรุณากรอกราคา/หน่วยให้มากกว่า 0');
          return;
        }

        if (Number.isNaN(unitStep) || unitStep <= 0) {
          setFormError('กรุณากรอกสเต็ปจำนวนให้มากกว่า 0');
          return;
        }

        if (
          Number.isNaN(unitMin) ||
          Number.isNaN(unitMax) ||
          Number.isNaN(targetQuantity) ||
          (unitMin !== null && unitMin < 0) ||
          (unitMax !== null && unitMax < 0) ||
          (targetQuantity !== null && targetQuantity < 0)
        ) {
          setFormError('กรุณากรอกจำนวนขั้นต่ำ/สูงสุด/เป้าหมายเป็นตัวเลขไม่ติดลบ');
          return;
        }

        if (unitMin !== null && unitMax !== null && unitMin > unitMax) {
          setFormError('จำนวนขั้นต่ำต้องไม่มากกว่าจำนวนสูงสุด');
          return;
        }
      }

      baseTaskData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        priority: formData.priority,
        proof_type_required: formData.proof_type_required,
        reward_amount: isUnitReward ? null : rewardAmount,
        reward_type: formData.reward_type,
        unit_label: isUnitReward ? formData.unit_label.trim() : null,
        unit_rate: isUnitReward ? unitRate : null,
        unit_step: isUnitReward ? unitStep : 1,
        unit_min: isUnitReward ? unitMin : null,
        unit_max: isUnitReward ? unitMax : null,
        target_quantity: isUnitReward ? targetQuantity : null,
        requires_approval: isUnitReward ? true : formData.requires_approval,
      };
    }

    const targets = formData.target_type === 'employee'
      ? [formData.target_id]
      : employeeStore.getUsersByBranch(formData.target_id).filter(u => u.role === 'employee').map(u => u.id);

    if (targets.length === 0) {
      setFormError('ไม่พบพนักงานในกลุ่มเป้าหมายที่เลือก');
      return;
    }

    setLoading(true);

    try {
      const results = await Promise.all(
        targets.map(async (userId) => {
          const newTask: Omit<Task, 'id' | 'created_at'> = {
            ...baseTaskData,
            assigned_to: userId,
            due_date: formData.due_date,
            status: 'pending' as const,
          };

          const assignmentResult = await taskStore.addTask(newTask);

          if (assignmentResult?.created) {
            const { error: notificationError } = await supabase.from('notifications').insert({
              user_id: userId,
              title: 'งานใหม่รอดำเนินการ',
              message: `ผู้จัดการมอบหมายงาน "${newTask.title}" ให้คุณ (กำหนดส่ง: ${formatThaiDate(newTask.due_date)})`,
              type: 'task',
              link: '/employee/tasks',
            });

            if (notificationError) {
              console.error('Failed to notify assigned employee:', notificationError.message || notificationError, notificationError);
            }
          }

          return assignmentResult;
        }),
      );

      const assignedCount = results.filter(Boolean).length;
      const createdCount = results.filter((result) => result?.created).length;
      const existingCount = results.filter((result) => result && !result.created).length;

      if (assignedCount === 0) {
        setFormError('มอบหมายงานไม่สำเร็จ ระบบไม่ได้บันทึกงานลงฐานข้อมูล กรุณาลองใหม่อีกครั้ง');
        return;
      }

      if (assignedCount < targets.length) {
        await taskStore.fetchInitialData();
        setFormError(`มอบหมายสำเร็จ ${assignedCount}/${targets.length} คน บางรายการบันทึกไม่สำเร็จ กรุณาลองใหม่สำหรับคนที่เหลือ`);
        return;
      }

      await taskStore.fetchInitialData();
      setAssignmentSummary(
        existingCount > 0
          ? `สร้างงานใหม่ ${createdCount} รายการ และพบงานเดิม ${existingCount} รายการ ระบบใช้รายการเดิมโดยไม่แจ้งเตือนซ้ำ`
          : `สร้างงานใหม่ ${createdCount} รายการ และแจ้งเตือนพนักงานเรียบร้อยแล้ว`,
      );
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setIsModalOpen(false);
      }, 1500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-20 max-w-[1600px] mx-auto">
      {/* Strategic Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 border-b border-slate-100 pb-8">
        <div className="space-y-4">
          <div className="flex items-center gap-5">
             <div className="h-16 w-16 rounded-2xl bg-slate-900 flex items-center justify-center text-primary-400 shadow-lg shadow-slate-200 ring-4 ring-slate-50">
                <ClipboardList className="w-8 h-8 fill-primary-400/20" />
             </div>
             <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none mb-2">ศูนย์กระจายงานพนักงาน</h1>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em] flex items-center gap-2">
                   Strategic Task Hub • <span className="text-emerald-500 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" /> Real-time Sync</span>
                </p>
             </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
          <div className="hidden sm:flex items-center gap-6 px-8 border-r border-slate-100">
             <div>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2 text-right sm:text-left">สถานะคิวงาน</p>
                <p className="text-base font-black text-slate-900 flex items-center gap-2">
                   {taskStore.tasks.filter(t => t.status === 'pending').length} <span className="text-[10px] text-amber-500 font-black uppercase tracking-wider bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">Pending</span>
                </p>
             </div>

          </div>
          <Button onClick={openAssignmentModal} className="h-12 px-8 rounded-full shadow-sm shadow-primary-900/10 active:scale-95" icon={<Plus className="w-4 h-4 mr-2" />}>
            มอบหมายงานใหม่
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Aspect: Tactical Intelligence */}
        <div className="xl:col-span-3 space-y-6 lg:sticky lg:top-24">

           {/* Priority Snapshot */}
           <Card className="rounded-2xl border-slate-100 shadow-sm shadow-slate-200/50 p-8 bg-white space-y-8">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <div className="p-3 bg-slate-100 text-slate-900 rounded-2xl">
                       <CalendarCheck className="w-5 h-5" />
                    </div>
                    <h2 className="text-xs font-black text-slate-900 uppercase tracking-wide">สถิติปัจจุบัน</h2>
                 </div>
                 <div className="h-2 w-2 rounded-full bg-primary-500 animate-pulse" />
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                 <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100 group hover:border-red-200 transition-all hover:bg-red-50/30">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 text-right">งานเร่งด่วนรอดำเนินการ</p>
                    <div className="flex items-end justify-between leading-none">
                       <p className="text-4xl font-black text-slate-900 tracking-tighter truncate">
                          {taskStore.tasks.filter(t => t.priority === 'critical' && t.status !== 'approved').length}
                       </p>
                       <div className={`h-10 w-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center ${taskStore.tasks.some(t => t.priority === 'critical' && t.status !== 'approved') ? 'animate-bounce' : ''}`}>
                          <AlertTriangle className="w-5 h-5 fill-red-600/20" />
                       </div>
                    </div>
                 </div>
                 
                 <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100 group hover:border-primary-200 transition-all hover:bg-primary-50/30">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 text-right">พนักงานที่กำลังทำงาน</p>
                    <div className="flex items-end justify-between leading-none">
                       <p className="text-4xl font-black text-slate-900 tracking-tighter truncate">
                          {new Set(taskStore.tasks.filter(t => t.status !== 'approved').map(t => t.assigned_to)).size}
                       </p>
                       <div className="h-10 w-10 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center">
                          <Users className="w-5 h-5 fill-primary-600/20" />
                       </div>
                    </div>
                 </div>
              </div>
           </Card>
        </div>

        {/* Right Aspect: Task Registry */}
        <div className="xl:col-span-9 space-y-8">
           <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden p-0" padding="none">
              <div className="border-b border-slate-100 bg-white p-6 lg:p-8">
                 <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                       <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-2">บันทึกการมอบหมายงาน</h2>
                       <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Task Distribution Registry</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
                       <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">กำลังแสดง</p>
                          <p className="mt-1 text-sm font-black text-slate-900">
                            {displayedAssignmentTasks.length}
                            <span className="mx-1 text-slate-300">/</span>
                            {filteredAssignmentTasks.length}
                            <span className="ml-1 text-[10px] uppercase tracking-widest text-slate-400">รายการ</span>
                          </p>
                       </div>
                       <Button
                         variant={showFilters ? 'primary' : 'outline'}
                         size="md"
                         className="h-full min-h-[58px] rounded-2xl"
                         icon={<Filter className="w-4 h-4" />}
                         onClick={() => setShowFilters((value) => !value)}
                       >
                         ตัวกรองเพิ่มเติม{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                       </Button>
                    </div>
                 </div>

                 <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50/70 p-3 shadow-inner shadow-slate-200/40">
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(260px,1fr)_auto_auto]">
                       <div className="relative">
                          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            aria-label="ค้นหางานที่มอบหมาย"
                            className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-primary-400 focus:ring-4 focus:ring-primary-100"
                            placeholder="ค้นหาชื่องาน พนักงาน หรือสาขา"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                          />
                       </div>

                       <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
                          {DATE_SCOPE_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setDateScope(option.value)}
                              className={`h-10 rounded-xl px-3 text-xs font-black transition ${
                                dateScope === option.value
                                  ? 'bg-primary-700 text-white shadow-sm'
                                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                       </div>

                       <Select
                         aria-label="จำนวนที่แสดง"
                         className="h-12 rounded-2xl border-slate-200 text-sm font-black"
                         value={tableLimit}
                         onChange={(event) => setTableLimit(event.target.value as TableLimit)}
                         options={TABLE_LIMIT_OPTIONS}
                       />
                    </div>

                    {dateScope === 'custom' && (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <span className="text-xs font-black uppercase tracking-widest text-slate-400">วันที่ที่ต้องการดู</span>
                        <input
                          aria-label="เลือกวันที่"
                          type="date"
                          className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm outline-none transition focus:border-primary-400 focus:ring-4 focus:ring-primary-100"
                          value={customDate}
                          onChange={(event) => setCustomDate(event.target.value)}
                        />
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                       {QUICK_STATUS_OPTIONS.map((option) => (
                         <button
                           key={option.value}
                           type="button"
                           onClick={() => setStatusFilter(option.value)}
                           className={`h-10 rounded-full border px-4 text-xs font-black transition ${
                             statusFilter === option.value
                               ? 'border-primary-700 bg-primary-700 text-white shadow-sm'
                               : 'border-slate-200 bg-white text-slate-500 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-800'
                           }`}
                         >
                           {option.label}
                         </button>
                       ))}
                       <button
                         type="button"
                         onClick={resetFilters}
                         className="ml-auto inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-xs font-black text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                       >
                         <RotateCcw className="h-3.5 w-3.5" />
                         ล้างทั้งหมด
                       </button>
                    </div>

                    {activeFilterChips.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200/70 pt-3">
                        {activeFilterChips.map((chip) => (
                          <button
                            key={chip.key}
                            type="button"
                            onClick={chip.onClear}
                            className="inline-flex h-8 items-center gap-2 rounded-full bg-white px-3 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:text-red-600 hover:ring-red-200"
                          >
                            {chip.label}
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ))}
                      </div>
                    )}
                 </div>

                 {showFilters && (
                   <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                     <div className="mb-4 flex items-center justify-between gap-3">
                       <div>
                         <p className="text-sm font-black text-slate-900">ตัวกรองเพิ่มเติม</p>
                         <p className="text-xs font-medium text-slate-400">หลักฐาน, ความสำคัญ, ทีม และค่าตอบแทน</p>
                       </div>
                       <Button
                         variant="ghost"
                         size="sm"
                         icon={<X className="w-4 h-4" />}
                         onClick={() => setShowFilters(false)}
                       >
                         ปิด
                       </Button>
                     </div>

                     <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                       <Select
                         label="หลักฐาน"
                         value={proofFilter}
                         onChange={(event) => setProofFilter(event.target.value as 'all' | ProofType)}
                         options={[
                           { value: 'all', label: 'ทุกประเภทหลักฐาน' },
                           ...PROOF_SELECT_OPTIONS,
                         ]}
                       />
                       <Select
                         label="ความสำคัญ"
                         value={priorityFilter}
                         onChange={(event) => setPriorityFilter(event.target.value as 'all' | Priority)}
                         options={[
                           { value: 'all', label: 'ทุกระดับ' },
                           ...PRIORITY_SELECT_OPTIONS,
                         ]}
                       />
                       <Select
                         label="ประเภทค่าตอบแทน"
                         value={rewardTypeFilter}
                         onChange={(event) => setRewardTypeFilter(event.target.value as 'all' | RewardType)}
                         options={[
                           { value: 'all', label: 'ทุกประเภทค่าตอบแทน' },
                           { value: 'fixed', label: 'เหมาจ่าย' },
                           { value: 'unit', label: 'คิดตามจำนวน' },
                         ]}
                       />
                       <Select
                         label="สาขา"
                         value={branchFilter}
                         onChange={(event) => {
                           setBranchFilter(event.target.value);
                           setEmployeeFilter('all');
                         }}
                         options={[
                           { value: 'all', label: 'ทุกสาขา' },
                           ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
                         ]}
                       />
                       <Select
                         label="พนักงาน"
                         value={employeeFilter}
                         onChange={(event) => setEmployeeFilter(event.target.value)}
                         options={[
                           { value: 'all', label: 'ทุกคน' },
                           ...employees
                             .filter((employee) => branchFilter === 'all' || employee.branch_id === branchFilter)
                             .map((employee) => ({
                               value: employee.id,
                               label: employee.full_name,
                               description: branchStore.getBranchById(employee.branch_id)?.name || 'ไม่ระบุสาขา',
                               avatarUrl: employee.avatar_url,
                             })),
                         ]}
                         searchable
                      />
                     </div>
                   </div>
                 )}
              </div>
              
              <div className="overflow-x-auto">
                 <table className="w-full min-w-[860px] text-left">
                    <thead>
                       <tr className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400 bg-slate-50/50 border-b border-slate-100">
                          <th className="px-10 py-6">ผู้รับผิดชอบ</th>
                          <th className="px-6 py-6">รายละเอียด / หัวข้องาน</th>
                          <th className="px-6 py-6 text-center">หลักฐาน</th>
                          <th className="px-6 py-6">กำหนดส่ง</th>
                          <th className="sticky right-0 z-10 bg-slate-50/95 px-6 py-6 text-right shadow-[-18px_0_28px_-26px_rgba(15,23,42,0.5)] backdrop-blur">สถานะ</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {displayedAssignmentTasks.length === 0 ? (
                         <tr>
                           <td colSpan={5} className="px-10 py-14 text-center">
                             <div className="mx-auto max-w-sm rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8">
                               <ClipboardList className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                               <p className="text-sm font-bold text-slate-700">ไม่พบรายการมอบหมายงาน</p>
                               <p className="mt-1 text-xs text-slate-400">ลองเปลี่ยนช่วงวันที่หรือเงื่อนไขตัวกรอง</p>
                             </div>
                           </td>
                         </tr>
                       ) : displayedAssignmentTasks.map((task) => {
                          const emp = employeeStore.getUserById(task.assigned_to);
                          const isDeadlineSoon = !isSameCalendarDate(task.due_date, getCurrentDateStr()) && new Date(task.due_date).getTime() < new Date().getTime();
                          
                          return (
                             <tr key={task.id} className="group hover:bg-slate-100/30 transition-all duration-300">
                                <td className="px-8 py-8">
                                   <div className="flex items-center gap-4">
                                      <div className="relative">
                                         {emp?.avatar_url ? (
                                           <img src={emp.avatar_url} alt="" className="w-12 h-12 rounded-2xl object-cover border-2 border-white shadow-sm ring-1 ring-slate-100" />
                                         ) : (
                                           <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center border-2 border-white shadow-sm ring-1 ring-slate-100 group-hover:bg-primary-600 transition-colors">
                                             <User className="w-6 h-6 text-primary-600 group-hover:text-white transition-colors" />
                                           </div>
                                         )}
                                         <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-lg bg-white p-0.5 border border-slate-100 shadow-sm">
                                            <div className={`w-full h-full rounded-full ${task.status === 'approved' ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
                                          </div>
                                       </div>
                                      <div className="flex flex-col">
                                         <span className="text-sm font-black text-slate-900 leading-tight mb-0.5">{emp?.full_name}</span>
                                         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{branchStore.getBranchById(emp?.branch_id || '')?.name || 'สำนักงานใหญ่'}</span>
                                      </div>
                                   </div>
                                </td>
                                <td className="px-6 py-8">
                                   <div className="space-y-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                         <span className="max-w-[280px] truncate text-sm font-black text-slate-800 tracking-tight leading-none transition-colors group-hover:text-primary-600">{task.title}</span>
                                         <div className={`
                                            px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border shadow-sm
                                            ${task.priority === 'critical' ? 'bg-red-50 text-red-600 border-red-100 animate-pulse' : 
                                              task.priority === 'high' ? 'bg-orange-50 text-orange-600 border-orange-100' : 
                                              task.priority === 'medium' ? 'bg-primary-50 text-primary-600 border-primary-100' : 
                                              'bg-slate-50 text-slate-400 border-slate-100'}
                                         `}>
                                            {task.priority === 'critical' ? 'Urgent' : 
                                              task.priority === 'high' ? 'High' : 
                                              task.priority === 'medium' ? 'Normal' : 'Low'}
                                         </div>
                                         {task.reward_type === 'unit' && (
                                           <div className="px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border border-emerald-100 bg-emerald-50 text-emerald-700 shadow-sm">
                                             Unit
                                           </div>
                                         )}
                                      </div>
                                      <p className="text-[11px] font-medium text-slate-400 line-clamp-1 leading-relaxed max-w-[250px]">{task.description}</p>
                                   </div>
                                </td>
                                <td className="px-6 py-8 text-center">
                                   <div className="inline-flex items-center gap-2 p-2 bg-slate-50 rounded-2xl group-hover:bg-primary-50 transition-colors">
                                      <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-primary-600 group-hover:border-primary-100 transition-all shadow-sm">
                                         {task.proof_type_required === 'photo' ? <Camera className="w-5 h-5" /> : 
                                          task.proof_type_required === 'video' ? <Zap className="w-5 h-5" /> : <ClipboardList className="w-5 h-5" />}
                                      </div>
                                   </div>
                                </td>
                                <td className="px-6 py-8">
                                   <div className="flex flex-col gap-1.5">
                                      <div className="flex items-center gap-2">
                                         <div className={`p-1 rounded-md ${isDeadlineSoon ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-500'}`}>
                                            <Calendar className="w-3.5 h-3.5" />
                                         </div>
                                         <span className={`text-xs font-black tracking-tight ${isDeadlineSoon ? 'text-red-500' : 'text-slate-600'}`}>
                                            {formatThaiDate(task.due_date)}
                                         </span>
                                      </div>
                                      {isDeadlineSoon && (
                                         <span className="text-[9px] font-black uppercase text-red-500 bg-red-50 px-2.5 py-1 rounded-full w-fit border border-red-100 animate-pulse">
                                            Overdue
                                         </span>
                                      )}
                                   </div>
                                </td>
                                <td className="sticky right-0 z-10 bg-white/95 px-6 py-8 text-right shadow-[-18px_0_28px_-26px_rgba(15,23,42,0.5)] backdrop-blur transition-colors group-hover:bg-slate-50/95">
                                   <div className="flex items-center justify-end gap-2">
                                      <Badge variant={getStatusVariant(task.status)} className="font-black text-[10px] uppercase tracking-wider py-2.5 px-5 shadow-sm border border-slate-50 whitespace-nowrap">
                                         {ASSIGNMENT_STATUS_LABELS[task.status]}
                                      </Badge>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        ariaLabel={`ลบงาน ${task.title}`}
                                        title="ลบงาน"
                                        icon={<Trash2 className="h-4 w-4" />}
                                        className="h-10 w-10 rounded-xl border border-red-100 bg-red-50 text-red-500 shadow-sm hover:bg-red-100 hover:text-red-700 focus-visible:ring-red-500"
                                        disabled={deletingTaskId === task.id}
                                        onClick={() => openDeleteTask(task)}
                                      />
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
      </div>

      {/* Modernized Assignment Modal */}
      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setFormError(''); setAssignmentSummary(''); }} title="การมอบหมายงานเชิงปฏิบัติการ" size="lg">
        <div className="bg-slate-900 rounded-2xl p-6 sm:p-8 mb-6 text-white relative overflow-hidden">
           <div className="absolute top-0 right-0 p-8 opacity-10">
              <ClipboardList className="w-32 h-32" />
           </div>
           <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                 <div className="bg-primary-500 rounded-xl p-2">
                    <Send className="w-5 h-5 text-white" />
                 </div>
                 <h2 className="text-xl font-black tracking-tight">มอบหมายงานใหม่</h2>
              </div>
              <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-[280px]">
                 มอบหมายรายบุคคลหรือรายสาขา พร้อมการแจ้งเตือน
              </p>
           </div>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center py-12 text-center animate-scale-in">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6 shadow-sm shadow-emerald-900/10">
              <CheckCircle2 className="w-12 h-12 text-emerald-600" />
            </div>
            <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight">มอบหมายงานสำเร็จ</h4>
            <p className="text-sm text-slate-500 mt-2">{assignmentSummary || 'พนักงานที่เกี่ยวข้องได้รับแจ้งเตือนเรียบร้อยแล้ว'}</p>
          </div>
        ) : (
          <div className="space-y-6 pt-4">
            <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-wide ml-1">ที่มาของงาน</label>
               <div className="flex gap-4 p-1.5 bg-slate-100 rounded-2xl border border-slate-100">
                 <button 
                   onClick={() => setFormData({...formData, mode: 'template'})}
                   className={`flex-1 flex items-center justify-center gap-3 py-3 text-sm font-black uppercase tracking-tighter rounded-xl transition-all
                     ${formData.mode === 'template' ? 'bg-white shadow-md text-primary-700' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                   <ClipboardList className="w-4 h-4" /> ใช้ต้นแบบงาน
                 </button>
                 <button 
                   onClick={() => setFormData({
                     ...formData,
                     mode: 'custom',
                     template_id: '',
                     reward_type: 'fixed',
                     unit_label: '',
                     unit_rate: '',
                     unit_step: '1',
                     unit_min: '',
                     unit_max: '',
                     target_quantity: '',
                   })}
                   className={`flex-1 flex items-center justify-center gap-3 py-3 text-sm font-black uppercase tracking-tighter rounded-xl transition-all
                     ${formData.mode === 'custom' ? 'bg-white shadow-md text-primary-700' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                   <Plus className="w-4 h-4" /> สร้างงานชั่วคราว
                 </button>
               </div>
            </div>

            {formData.mode === 'template' ? (
              <Select 
                label="ต้นแบบงานที่พร้อมใช้"
                options={templates.map(t => ({ value: t.id, label: t.title }))}
                value={formData.template_id}
                onChange={(e) => {
                  const t = templates.find(temp => temp.id === e.target.value);
                  setFormData({
                    ...formData, 
                    template_id: e.target.value,
                    reward_amount: t?.reward_amount ? String(t.reward_amount) : '',
                    reward_type: t?.reward_type || 'fixed',
                    unit_label: t?.unit_label || '',
                    unit_rate: t?.unit_rate != null ? String(t.unit_rate) : '',
                    unit_step: t?.unit_step != null ? String(t.unit_step) : '1',
                    unit_min: t?.unit_min != null ? String(t.unit_min) : '',
                    unit_max: t?.unit_max != null ? String(t.unit_max) : '',
                    target_quantity: t?.target_quantity != null ? String(t.target_quantity) : '',
                    requires_approval: t?.reward_type === 'unit' ? true : formData.requires_approval,
                  });
                }}
                placeholder="เลือกจากต้นแบบงานที่มี"
              />
            ) : (
              <div className="space-y-6">
                <Input 
                  label="หัวข้องาน (Directive)"
                  placeholder="เช่น ตรวจสอบสต็อก Phase 1"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                />
                <Input 
                  label="รายละเอียดวัตถุประสงค์"
                  placeholder="ระบุรายละเอียดขั้นตอนการทำงาน..."
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Select 
                    label="ลำดับความสำคัญ"
                    options={PRIORITY_SELECT_OPTIONS}
                    value={formData.priority}
                    onChange={(e) => setFormData({...formData, priority: e.target.value as Priority})}
                  />
                  <Select 
                    label="รูปแบบหลักฐานที่ต้องการ"
                    options={PROOF_SELECT_OPTIONS.filter((option) => ['photo', 'video', 'text'].includes(option.value))}
                    value={formData.proof_type_required}
                    onChange={(e) => setFormData({...formData, proof_type_required: e.target.value as ProofType})}
                  />
                </div>
              </div>
            )}

            <div className="pt-2 space-y-4">
              {formData.mode === 'custom' && (
                <Select
                  label="รูปแบบค่าตอบแทน"
                  options={REWARD_TYPE_OPTIONS}
                  value={formData.reward_type}
                  onChange={(event) => setFormData({
                    ...formData,
                    reward_type: event.target.value as RewardType,
                    requires_approval: event.target.value === 'unit' ? true : formData.requires_approval,
                  })}
                />
              )}

              {formData.reward_type === 'unit' ? (
                formData.mode === 'custom' ? (
                  <UnitRewardFields
                    values={formData}
                    onChange={(patch) => setFormData((current) => ({ ...current, ...patch }))}
                  />
                ) : (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-800">
                    ค่าตอบแทนคิดตามจำนวน: ฿{formData.unit_rate || 0}/{formData.unit_label || 'หน่วย'}
                    {formData.target_quantity ? ` · เป้าหมาย ${formData.target_quantity} ${formData.unit_label || 'หน่วย'}` : ''}
                  </div>
                )
              ) : (
                <Input
                  label="จำนวนเงินพิเศษสำหรับงานนี้ (บาท) - ปล่อยว่างเพื่อใช้ค่ามาตรฐาน"
                  type="number"
                  placeholder="เช่น 50, 100"
                  value={formData.reward_amount}
                  onChange={(e) => setFormData({...formData, reward_amount: e.target.value})}
                />
              )}

              {formData.mode === 'custom' && (
                <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <div className="flex-1">
                    <p className="text-sm font-black text-slate-900">รอตรวจสอบจากหัวหน้างาน</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">สถานะเสร็จสิ้นหลังผู้ดูแลอนุมัติ</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={formData.reward_type === 'unit' || formData.requires_approval}
                      disabled={formData.reward_type === 'unit'}
                      onChange={(e) => setFormData({...formData, requires_approval: e.target.checked})}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                  </label>
                </div>
              )}
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-50">
               <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wide ml-1">กลุ่มเป้าหมาย</label>
                  <div className="flex gap-4 p-1.5 bg-slate-100 rounded-2xl border border-slate-100">
                    <button 
                      onClick={() => setFormData({...formData, target_type: 'employee', target_id: ''})}
                      className={`flex-1 flex items-center justify-center gap-3 py-3 text-sm font-black uppercase tracking-tighter rounded-xl transition-all
                        ${formData.target_type === 'employee' ? 'bg-white shadow-md text-primary-700' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <User className="w-4 h-4" /> รายบุคคล
                    </button>
                    <button 
                      onClick={() => setFormData({...formData, target_type: 'branch', target_id: ''})}
                      className={`flex-1 flex items-center justify-center gap-3 py-3 text-sm font-black uppercase tracking-tighter rounded-xl transition-all
                        ${formData.target_type === 'branch' ? 'bg-white shadow-md text-primary-700' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <Building2 className="w-4 h-4" /> รายสาขา
                    </button>
                  </div>
               </div>

               {formData.target_type === 'employee' ? (
                 <Select 
                   label="รายชื่อพนักงาน"
                   options={employees.map(e => ({
                     value: e.id,
                     label: e.full_name,
                     description: branchStore.getBranchById(e.branch_id)?.name || 'ไม่ระบุสาขา',
                     avatarUrl: e.avatar_url,
                   }))}
                   value={formData.target_id}
                   onChange={(e) => setFormData({...formData, target_id: e.target.value})}
                   placeholder="ค้นหารายชื่อพนักงาน..."
                   searchable
                 />
               ) : (
                 <Select 
                   label="สาขา"
                   options={branches.map(b => ({ value: b.id, label: b.name }))}
                   value={formData.target_id}
                   onChange={(e) => setFormData({...formData, target_id: e.target.value})}
                   placeholder="เลือกสาขาเป้าหมาย"
                 />
               )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <Input 
                 label="กำหนดส่งงาน"
                 type="date"
                 icon={<Clock className="w-4 h-4" />}
                 value={formData.due_date}
                 onChange={(e) => setFormData({...formData, due_date: e.target.value})}
               />
               <div className="group p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">สถานะระบบ</span>
                  <div className="flex items-center gap-2">
                     <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                     <span className="text-[10px] font-black text-emerald-600 uppercase">พร้อม</span>
                  </div>
               </div>
            </div>

            {formData.target_type === 'branch' && formData.target_id && (
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex gap-4 animate-scale-in">
                <div className="p-3 bg-amber-100 rounded-xl h-fit">
                   <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                   <p className="text-xs font-black text-amber-900 uppercase tracking-tight">คำเตือนการมอบหมายงานแบบกลุ่ม</p>
                   <p className="text-[10px] font-medium text-amber-800/80 mt-1 leading-relaxed">
                     งานจะถูกส่งให้พนักงานทุกคนในสาขา **{branchStore.getBranchById(formData.target_id)?.name}**. 
                     <span className="font-bold text-amber-900"> จำนวนพนักงานที่รับทราบ: {employeeStore.getUsersByBranch(formData.target_id).filter(u => u.role === 'employee').length} คน</span>
                   </p>
                </div>
              </div>
            )}

            {formError && (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="flex gap-4 pt-6">
              <Button variant="secondary" className="flex-1 h-14 rounded-2xl font-black text-xs uppercase" onClick={() => { setIsModalOpen(false); setFormError(''); setAssignmentSummary(''); }}>ยกเลิก</Button>
              <Button 
                className="flex-[1.5] h-14 rounded-2xl font-black text-xs uppercase bg-slate-900 shadow-lg shadow-slate-900/10 active:scale-95"
                loading={loading}
                disabled={formData.mode === 'template' ? (!formData.template_id || !formData.target_id) : (!formData.title || !formData.target_id)}
                onClick={handleAssign}
                icon={<Send className="w-4 h-4" />}
              >
                ยืนยันการมอบหมายงาน
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(taskToDelete)}
        onClose={() => {
          if (!deletingTaskId) {
            setTaskToDelete(null);
            setDeleteError('');
          }
        }}
        title="ยืนยันการลบงาน"
        size="sm"
      >
        {taskToDelete && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-red-600 shadow-sm">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-red-950">ลบงานนี้ออกจากระบบ</p>
                  <p className="mt-1 truncate text-sm font-semibold text-red-700">{taskToDelete.title}</p>
                </div>
              </div>
            </div>

            <p className="text-sm leading-6 text-slate-500">
              เมื่อลบแล้ว งานนี้จะหายจากประวัติการมอบหมายของผู้จัดการ และหายจากเมนูงานของพนักงานทันที รวมถึงรายการส่งงานและไฟล์หลักฐานที่ผูกกับงานนี้
            </p>

            {deleteError && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                {deleteError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setTaskToDelete(null);
                  setDeleteError('');
                }}
                disabled={Boolean(deletingTaskId)}
              >
                ยกเลิก
              </Button>
              <Button
                variant="danger"
                loading={deletingTaskId === taskToDelete.id}
                onClick={() => void handleDeleteTask()}
                icon={<Trash2 className="h-4 w-4" />}
              >
                ลบงาน
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
