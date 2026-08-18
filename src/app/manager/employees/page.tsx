'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useEmployeeStore } from '@/store/employeeStore';
import { useBranchStore } from '@/store/branchStore';
import { useAuthStore } from '@/store/authStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useHrStore } from '@/store/hrStore';
import { useTaskStore } from '@/store/taskStore';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import {
  UserPlus,
  Search,
  Edit2,
  Trash2,
  Building2,
  Mail,
  Shield,
  User,
  AlertCircle,
  UserMinus,
  KeyRound,
  WalletCards,
  TrendingUp,
  TrendingDown,
  Trophy,
  CheckCircle2,
  Clock,
  Coins,
  ClipboardList,
  CalendarDays,
} from 'lucide-react';
import { ROLE_LABELS, TASK_STATUS_LABELS } from '@/lib/constants';
import { getCurrentDateStr, formatThaiDate, isSameCalendarDate } from '@/lib/dateUtils';
import { buildPayrollSummary, formatMinutesAsHours, getMonthDateRange } from '@/lib/hr';
import {
  formatMilestoneReward,
  formatThaiCurrency,
  getEarnedMilestoneReward,
  getMilestoneReward,
  isAttendanceTask,
  isMilestoneComplete,
  isMilestonePendingReview,
  sortMilestoneTasks,
} from '@/lib/taskMilestones';
import type { TaskStatus, User as UserType, UserRole } from '@/lib/types';

type EmployeeFormData = {
  full_name: string;
  email: string;
  role: UserRole;
  branch_id: string;
  team_id: string;
  password: string;
  status: 'active' | 'inactive';
};

function createEmptyFormData(branchId: string): EmployeeFormData {
  return {
    full_name: '',
    email: '',
    role: 'employee',
    branch_id: branchId,
    team_id: '',
    password: '',
    status: 'active',
  };
}

function getTaskStatusVariant(status: TaskStatus) {
  switch (status) {
    case 'approved':
      return 'success' as const;
    case 'submitted':
      return 'warning' as const;
    case 'rejected':
    case 'overdue':
      return 'danger' as const;
    case 'in_progress':
      return 'info' as const;
    default:
      return 'slate' as const;
  }
}

function getTaskStatusIcon(status: TaskStatus) {
  if (isMilestoneComplete(status)) {
    return <CheckCircle2 className="h-4 w-4" />;
  }

  if (isMilestonePendingReview(status)) {
    return <Clock className="h-4 w-4" />;
  }

  return <ClipboardList className="h-4 w-4" />;
}

export default function EmployeeManagementPage() {
  const users = useEmployeeStore((state) => state.users);
  const addUser = useEmployeeStore((state) => state.addUser);
  const updateUser = useEmployeeStore((state) => state.updateUser);
  const deleteUser = useEmployeeStore((state) => state.deleteUser);
  const resetPassword = useEmployeeStore((state) => state.resetPassword);
  const isLoading = useEmployeeStore((state) => state.isLoading);
  const branches = useBranchStore((state) => state.branches);
  const getBranchById = useBranchStore((state) => state.getBranchById);
  const currentUser = useAuthStore((state) => state.currentUser);
  const attendanceRecords = useAttendanceStore((state) => state.records);
  const tasks = useTaskStore((state) => state.tasks);
  const templates = useTaskStore((state) => state.templates);
  const branchPolicies = useHrStore((state) => state.branchPolicies);
  const employeeRequests = useHrStore((state) => state.employeeRequests);
  const shiftAssignments = useHrStore((state) => state.shiftAssignments);
  const getCompensationProfile = useHrStore((state) => state.getCompensationProfile);

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<UserType | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserType | null>(null);
  const [userToResetPassword, setUserToResetPassword] = useState<UserType | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [formError, setFormError] = useState('');
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  const accessibleBranches = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    if (isAdmin) {
      return branches;
    }

    return branches.filter((branch) => branch.id === currentUser.branch_id);
  }, [branches, currentUser, isAdmin]);

  const defaultBranchId = currentUser?.branch_id || accessibleBranches[0]?.id || '';

  const [formData, setFormData] = useState<EmployeeFormData>(() => createEmptyFormData(defaultBranchId));

  const scopedEmployees = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    if (isAdmin) {
      return users;
    }

    return users.filter((user) => user.branch_id === currentUser.branch_id);
  }, [currentUser, isAdmin, users]);

  const filteredEmployees = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return scopedEmployees;
    }

    return scopedEmployees.filter((user) => {
      return [user.full_name, user.email, user.team_id]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(keyword));
    });
  }, [scopedEmployees, search]);

  const activeEmployees = useMemo(() => filteredEmployees.filter(u => u.status !== 'inactive'), [filteredEmployees]);
  const inactiveEmployees = useMemo(() => filteredEmployees.filter(u => u.status === 'inactive'), [filteredEmployees]);
  const todayDate = getCurrentDateStr();
  const monthRange = useMemo(() => getMonthDateRange(new Date()), []);
  const templateById = useMemo(() => {
    return new Map(templates.map((template) => [template.id, template]));
  }, [templates]);
  const getTaskTemplate = (templateId?: string | null) => (
    templateId ? templateById.get(templateId) ?? null : null
  );

  const selectedBranch = selectedEmployee?.branch_id ? getBranchById(selectedEmployee.branch_id) : null;
  const selectedPayrollSummary = useMemo(() => {
    if (!selectedEmployee) {
      return null;
    }

    return buildPayrollSummary({
      user: selectedEmployee,
      startDate: monthRange.start,
      endDate: monthRange.end,
      records: attendanceRecords,
      assignments: shiftAssignments,
      branchPolicies,
      requests: employeeRequests.filter((request) => request.user_id === selectedEmployee.id),
      tasks,
      taskTemplates: templates,
      compensationProfile: getCompensationProfile(selectedEmployee.id) ?? null,
    });
  }, [
    attendanceRecords,
    branchPolicies,
    employeeRequests,
    getCompensationProfile,
    monthRange.end,
    monthRange.start,
    selectedEmployee,
    shiftAssignments,
    tasks,
    templates,
  ]);

  const selectedMilestoneTasks = useMemo(() => {
    if (!selectedEmployee) {
      return [];
    }

    return sortMilestoneTasks(
      tasks.filter((task) => task.assigned_to === selectedEmployee.id && isSameCalendarDate(task.due_date, todayDate)),
      (task) => (task.template_id ? templateById.get(task.template_id) ?? null : null),
    );
  }, [selectedEmployee, tasks, templateById, todayDate]);

  const selectedCompletedMilestones = selectedMilestoneTasks.filter((task) => isMilestoneComplete(task.status));
  const selectedPendingReviewMilestones = selectedMilestoneTasks.filter((task) => isMilestonePendingReview(task.status));
  const selectedEarnedReward = selectedMilestoneTasks.reduce((sum, task) => {
    const template = getTaskTemplate(task.template_id);
    return sum + getEarnedMilestoneReward(task, template);
  }, 0);
  const selectedPotentialReward = selectedMilestoneTasks.reduce((sum, task) => {
    const template = getTaskTemplate(task.template_id);
    return sum + getMilestoneReward(task, template);
  }, 0);
  const selectedMilestoneProgress = selectedMilestoneTasks.length > 0
    ? Math.round((selectedCompletedMilestones.length / selectedMilestoneTasks.length) * 100)
    : 100;

  const branchOptions = accessibleBranches.map((branch) => ({ value: branch.id, label: branch.name }));
  const roleOptions = (isAdmin ? ['admin', 'manager', 'employee'] : ['employee']).map((role) => ({
    value: role,
    label: ROLE_LABELS[role as UserRole],
  }));

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setFormError('');
  };

  const handleOpenResetPasswordModal = (user: UserType) => {
    setUserToResetPassword(user);
    setNewPassword('');
    setResetError('');
    setResetSuccess('');
  };

  const handleCloseResetPasswordModal = () => {
    setUserToResetPassword(null);
    setNewPassword('');
    setResetError('');
    setResetSuccess('');
  };

  const handleResetPasswordConfirm = async () => {
    if (!userToResetPassword) return;

    const pwd = newPassword.trim();
    if (pwd.length < 8) {
      setResetError('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
      return;
    }

    const result = await resetPassword(userToResetPassword.id, pwd);
    if (result.success) {
      setResetSuccess('รีเซ็ตรหัสผ่านสำเร็จเรียบร้อยแล้ว');
      setTimeout(() => {
        handleCloseResetPasswordModal();
      }, 1500);
    } else {
      setResetError(result.error || 'รีเซ็ตรหัสผ่านไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }
  };

  const handleOpenModal = (user?: UserType) => {
    setFormError('');

    if (user) {
      setEditingUser(user);
      setFormData({
        full_name: user.full_name || '',
        email: user.email || '',
        role: isAdmin ? user.role : 'employee',
        branch_id: isAdmin ? user.branch_id || defaultBranchId : currentUser?.branch_id || user.branch_id || defaultBranchId,
        team_id: user.team_id || '',
        password: '',
        status: user.status || 'active',
      });
    } else {
      setEditingUser(null);
      setFormData(createEmptyFormData(defaultBranchId));
    }

    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!currentUser) {
      return;
    }

    const fullName = formData.full_name.trim();
    const email = formData.email.trim().toLowerCase();
    const teamId = formData.team_id.trim();
    const nextRole = isAdmin ? formData.role : 'employee';
    const nextBranchId = isAdmin ? formData.branch_id : currentUser.branch_id;

    if (!fullName || !email) {
      setFormError('กรุณากรอกชื่อและอีเมลให้ครบ');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('รูปแบบอีเมลไม่ถูกต้อง');
      return;
    }

    if (!nextBranchId) {
      setFormError('กรุณาเลือกสาขาให้พนักงาน');
      return;
    }

    if (!editingUser && formData.password.trim().length < 8) {
      setFormError('รหัสผ่านเริ่มต้นต้องมีอย่างน้อย 8 ตัวอักษร');
      return;
    }

    let success = false;

    if (editingUser) {
      success = await updateUser(editingUser.id, {
        full_name: fullName,
        email,
        role: nextRole,
        branch_id: nextBranchId,
        team_id: teamId,
        status: formData.status,
      });
    } else {
      success = await addUser(
        {
          full_name: fullName,
          email,
          role: nextRole,
          branch_id: nextBranchId,
          team_id: teamId,
          phone: '',
          status: 'active',
          avatar_url: '',
        },
        formData.password.trim(),
      );
    }

    if (!success) {
      setFormError(editingUser ? 'บันทึกข้อมูลพนักงานไม่สำเร็จ' : 'สร้างบัญชีพนักงานไม่สำเร็จ');
      return;
    }

    handleCloseModal();
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;

    const success = await deleteUser(userToDelete.id);
    if (success) {
      setUserToDelete(null);
    } else {
      setFormError('ลบพนักงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }
  };

  const openEmployeeDetail = (employee: UserType) => {
    setSelectedEmployee(employee);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleRowTouchStart = (employee: UserType) => {
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      openEmployeeDetail(employee);
      longPressTimerRef.current = null;
    }, 420);
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, employee: UserType) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openEmployeeDetail(employee);
    }
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">จัดการพนักงาน</h1>
          <p className="text-slate-500 text-sm mt-1">เพิ่ม แก้ไข และกำหนดข้อมูลพนักงานตามสิทธิ์ของผู้ใช้งานปัจจุบัน</p>
        </div>
        <Button
          onClick={() => handleOpenModal()}
          icon={<UserPlus className="w-4 h-4" />}
          disabled={!defaultBranchId}
        >
          เพิ่มพนักงานใหม่
        </Button>
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <Input
            id="search-emp"
            placeholder="ค้นหาชื่อหรืออีเมล..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <th className="px-6 py-3">พนักงาน</th>
                <th className="px-6 py-3">บทบาท</th>
                <th className="px-6 py-3">สาขา</th>
                <th className="px-6 py-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeEmployees.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-sm text-slate-500">
                    ไม่พบข้อมูลพนักงานที่ทำงานอยู่ตามเงื่อนไขที่ค้นหา
                  </td>
                </tr>
              ) : (
                activeEmployees.map((employee) => {
                  const branch = employee.branch_id ? getBranchById(employee.branch_id) : null;
                  const canManage = isAdmin || (employee.role === 'employee' && employee.branch_id === currentUser.branch_id);

                  return (
                    <tr
                      key={employee.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEmployeeDetail(employee)}
                      onKeyDown={(event) => handleRowKeyDown(event, employee)}
                      onTouchStart={() => handleRowTouchStart(employee)}
                      onTouchEnd={clearLongPressTimer}
                      onTouchMove={clearLongPressTimer}
                      onTouchCancel={clearLongPressTimer}
                      className={`group cursor-pointer transition-colors hover:bg-primary-50/40 focus-visible:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-200 ${!canManage ? 'opacity-70' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-xs shrink-0 overflow-hidden">
                            {employee.avatar_url ? (
                              <div
                                role="img"
                                aria-label={employee.full_name}
                                className="h-full w-full bg-cover bg-center bg-no-repeat"
                                style={{ backgroundImage: `url(${employee.avatar_url})` }}
                              />
                            ) : (
                              employee.full_name.charAt(0)
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{employee.full_name}</p>
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3" /> {employee.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={employee.role === 'admin' ? 'danger' : employee.role === 'manager' ? 'warning' : 'info'}>
                          {employee.role === 'admin' ? <Shield className="w-3 h-3 mr-1" /> : <User className="w-3 h-3 mr-1" />}
                          {ROLE_LABELS[employee.role]}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-600 flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 text-slate-400" />
                          {branch?.name || 'ไม่ระบุ'}
                        </span>
                      </td>
                      <td
                        className="px-6 py-4 text-right"
                        onClick={(event) => event.stopPropagation()}
                        onTouchStart={(event) => event.stopPropagation()}
                      >
                        {canManage ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenResetPasswordModal(employee)}
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              title={`รีเซ็ตรหัสผ่าน ${employee.full_name}`}
                              aria-label={`Reset password for ${employee.full_name}`}
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOpenModal(employee)}
                              className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                              title={`แก้ไขข้อมูล ${employee.full_name}`}
                              aria-label={`Edit ${employee.full_name}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setUserToDelete(employee)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title={`ลบพนักงาน ${employee.full_name}`}
                              aria-label={`Delete ${employee.full_name}`}
                              disabled={employee.id === currentUser.id}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex p-1.5 text-slate-300" aria-hidden="true" title="คุณไม่มีสิทธิ์จัดการพนักงานคนนี้">
                            <Shield className="w-4 h-4" />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {inactiveEmployees.length > 0 && (
        <Card padding="none" className="overflow-hidden opacity-75 mt-8">
          <div className="p-4 border-b border-slate-100 bg-slate-100/50">
            <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
              <UserMinus className="w-5 h-5 text-slate-400" />
              พนักงานที่ไม่ได้ทำงานแล้ว
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                  <th className="px-6 py-3">พนักงาน</th>
                  <th className="px-6 py-3">บทบาท</th>
                  <th className="px-6 py-3">สาขา</th>
                  <th className="px-6 py-3 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inactiveEmployees.map((employee) => {
                  const branch = employee.branch_id ? getBranchById(employee.branch_id) : null;
                  const canManage = isAdmin || (employee.role === 'employee' && employee.branch_id === currentUser.branch_id);

                  return (
                    <tr
                      key={employee.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEmployeeDetail(employee)}
                      onKeyDown={(event) => handleRowKeyDown(event, employee)}
                      onTouchStart={() => handleRowTouchStart(employee)}
                      onTouchEnd={clearLongPressTimer}
                      onTouchMove={clearLongPressTimer}
                      onTouchCancel={clearLongPressTimer}
                      className={`group cursor-pointer transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 ${!canManage ? 'opacity-70' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs shrink-0 overflow-hidden grayscale">
                            {employee.avatar_url ? (
                              <div
                                role="img"
                                aria-label={employee.full_name}
                                className="h-full w-full bg-cover bg-center bg-no-repeat"
                                style={{ backgroundImage: `url(${employee.avatar_url})` }}
                              />
                            ) : (
                              employee.full_name.charAt(0)
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-500 line-through">{employee.full_name}</p>
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3" /> {employee.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="default" className="grayscale opacity-70">
                          {employee.role === 'admin' ? <Shield className="w-3 h-3 mr-1" /> : <User className="w-3 h-3 mr-1" />}
                          {ROLE_LABELS[employee.role]}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-400 flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 text-slate-300" />
                          {branch?.name || 'ไม่ระบุ'}
                        </span>
                      </td>
                      <td
                        className="px-6 py-4 text-right"
                        onClick={(event) => event.stopPropagation()}
                        onTouchStart={(event) => event.stopPropagation()}
                      >
                        {canManage ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenResetPasswordModal(employee)}
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              title={`รีเซ็ตรหัสผ่าน ${employee.full_name}`}
                              aria-label={`Reset password for ${employee.full_name}`}
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOpenModal(employee)}
                              className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                              title={`แก้ไขข้อมูล ${employee.full_name}`}
                              aria-label={`Edit ${employee.full_name}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setUserToDelete(employee)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title={`ลบพนักงาน ${employee.full_name}`}
                              aria-label={`Delete ${employee.full_name}`}
                              disabled={employee.id === currentUser.id}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex p-1.5 text-slate-300" aria-hidden="true" title="คุณไม่มีสิทธิ์จัดการพนักงานคนนี้">
                            <Shield className="w-4 h-4" />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        isOpen={Boolean(selectedEmployee)}
        onClose={() => setSelectedEmployee(null)}
        title="ข้อมูลพนักงาน"
        size="full"
      >
        {selectedEmployee && (
          <div className="space-y-5">
            <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-slate-50">
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-4 border-white bg-primary-100 shadow-sm">
                    {selectedEmployee.avatar_url ? (
                      <div
                        role="img"
                        aria-label={selectedEmployee.full_name}
                        className="h-full w-full bg-cover bg-center bg-no-repeat"
                        style={{ backgroundImage: `url(${selectedEmployee.avatar_url})` }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl font-black text-primary-700">
                        {selectedEmployee.full_name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-black tracking-tight text-slate-950">
                        {selectedEmployee.full_name}
                      </h2>
                      <Badge variant={selectedEmployee.status === 'inactive' ? 'slate' : 'success'} dot>
                        {selectedEmployee.status === 'inactive' ? 'พักการใช้งาน' : 'ใช้งานอยู่'}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 ring-1 ring-slate-100">
                        <Mail className="h-3.5 w-3.5" />
                        {selectedEmployee.email}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 ring-1 ring-slate-100">
                        <Building2 className="h-3.5 w-3.5" />
                        {selectedBranch?.name || 'ไม่ระบุสาขา'}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 ring-1 ring-slate-100">
                        <Shield className="h-3.5 w-3.5" />
                        {ROLE_LABELS[selectedEmployee.role]}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:min-w-[300px]">
                  <div className="rounded-2xl bg-white/85 p-3 text-center ring-1 ring-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">งานวันนี้</p>
                    <p className="mt-1 text-xl font-black text-slate-950">{selectedMilestoneTasks.length}</p>
                  </div>
                  <div className="rounded-2xl bg-white/85 p-3 text-center ring-1 ring-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">รอตรวจ</p>
                    <p className="mt-1 text-xl font-black text-amber-600">{selectedPendingReviewMilestones.length}</p>
                  </div>
                  <div className="rounded-2xl bg-white/85 p-3 text-center ring-1 ring-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">สำเร็จ</p>
                    <p className="mt-1 text-xl font-black text-emerald-600">{selectedCompletedMilestones.length}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <section className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
                        <WalletCards className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500">ยอดเงินเดือนนี้</p>
                        <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">
                          {formatThaiCurrency(selectedPayrollSummary?.net_pay || 0)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          รอบ {selectedPayrollSummary?.start_date} ถึง {selectedPayrollSummary?.end_date}
                        </p>
                      </div>
                    </div>
                    <Badge variant="success">สุทธิ</Badge>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                      <div className="flex items-center gap-2 text-emerald-700">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">รายได้รวม</span>
                      </div>
                      <p className="mt-2 text-lg font-black text-emerald-900">
                        {formatThaiCurrency(selectedPayrollSummary?.total_earnings || 0)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-red-100 bg-red-50/70 p-4">
                      <div className="flex items-center gap-2 text-red-600">
                        <TrendingDown className="h-4 w-4" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">หักรวม</span>
                      </div>
                      <p className="mt-2 text-lg font-black text-red-700">
                        {formatThaiCurrency(selectedPayrollSummary?.total_deductions || 0)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Coins className="h-4 w-4" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">โบนัสงาน</span>
                      </div>
                      <p className="mt-2 text-lg font-black text-slate-900">
                        {formatThaiCurrency((selectedPayrollSummary?.attendance_reward || 0) + (selectedPayrollSummary?.task_reward || 0))}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-slate-500">
                        <CalendarDays className="h-4 w-4" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">วันทำงาน</span>
                      </div>
                      <p className="mt-2 text-lg font-black text-slate-900">
                        {selectedPayrollSummary?.worked_days || 0}/{selectedPayrollSummary?.scheduled_days || 0}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                      <span>มาสาย {formatMinutesAsHours(selectedPayrollSummary?.total_late_minutes || 0)}</span>
                      <span className="text-red-500">- {formatThaiCurrency(selectedPayrollSummary?.late_deduction || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                      <span className="text-slate-600">ค่าเช็คอิน</span>
                      <span className="font-bold text-emerald-700">+ {formatThaiCurrency(selectedPayrollSummary?.attendance_reward || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                      <span className="text-slate-600">ค่าตอบแทนงาน</span>
                      <span className="font-bold text-emerald-700">+ {formatThaiCurrency(selectedPayrollSummary?.task_reward || 0)}</span>
                    </div>
                  </div>
                </div>

                {selectedPayrollSummary && selectedPayrollSummary.money_lines.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-sm font-black text-slate-900">รายการเงินเดือนนี้</p>
                    <div className="mt-3 space-y-2">
                      {selectedPayrollSummary.money_lines.slice(0, 8).map((line) => (
                        <div key={line.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                          <span className="text-slate-600">{line.label}</span>
                          <span className={line.kind === 'earning' ? 'font-bold text-emerald-700' : 'font-bold text-red-600'}>
                            {line.kind === 'earning' ? '+' : '-'} {formatThaiCurrency(line.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
                      <Trophy className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900">Milestone วันนี้</p>
                      <p className="mt-1 text-xs text-slate-500">
                        ได้แล้ว {formatThaiCurrency(selectedEarnedReward)} จากเป้าหมาย {formatThaiCurrency(selectedPotentialReward)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-emerald-600">{selectedMilestoneProgress}%</p>
                    <p className="text-xs font-semibold text-slate-400">Progress</p>
                  </div>
                </div>

                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${selectedMilestoneProgress}%` }}
                  />
                </div>

                {selectedMilestoneTasks.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                    <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
                    <p className="mt-3 text-sm font-bold text-slate-950">วันนี้ยังไม่มีงานใน Milestone</p>
                    <p className="mt-1 text-xs text-slate-500">ยังไม่มีงานใน Milestone</p>
                  </div>
                ) : (
                  <div className="mt-5 space-y-2">
                    {selectedMilestoneTasks.map((task, index) => {
                      const template = getTaskTemplate(task.template_id);
                      const isComplete = isMilestoneComplete(task.status);
                      const isPendingReview = isMilestonePendingReview(task.status);
                      const rewardLabel = formatMilestoneReward(task, template);

                      return (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"
                        >
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black ${
                            isComplete
                              ? 'bg-emerald-500 text-white'
                              : isPendingReview
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-500'
                          }`}>
                            {isComplete || isPendingReview || isAttendanceTask(task, template)
                              ? getTaskStatusIcon(task.status)
                              : index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-bold text-slate-950">{task.title || template?.title || 'ไม่มีชื่องาน'}</p>
                              <Badge variant={getTaskStatusVariant(task.status)}>
                                {TASK_STATUS_LABELS[task.status]}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">กำหนด {formatThaiDate(task.due_date)}</p>
                          </div>
                          <div className={`shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-bold ${
                            isComplete
                              ? 'bg-emerald-50 text-emerald-700'
                              : isPendingReview
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-slate-50 text-slate-500'
                          }`}>
                            <span className="inline-flex items-center gap-1">
                              <Coins className="h-3.5 w-3.5" />
                              {rewardLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingUser ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงานใหม่'}
      >
        <div className="space-y-4">
          <Input
            label="ชื่อ-นามสกุล"
            placeholder="เช่น ปิยะ ธนวัฒน์"
            value={formData.full_name}
            onChange={(event) => setFormData({ ...formData, full_name: event.target.value })}
          />
          <Input
            label="อีเมล (ใช้เข้าสู่ระบบ)"
            type="email"
            placeholder="example@psrice.co"
            value={formData.email}
            onChange={(event) => setFormData({ ...formData, email: event.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="บทบาท"
              options={roleOptions}
              value={formData.role}
              onChange={(event) => setFormData({ ...formData, role: event.target.value as UserRole })}
              disabled={!isAdmin}
            />
            <Select
              label="สาขา"
              options={branchOptions}
              value={formData.branch_id}
              onChange={(event) => setFormData({ ...formData, branch_id: event.target.value })}
              disabled={!isAdmin}
            />
          </div>
          <Input
            label="ทีม/กลุ่มงาน"
            placeholder="เช่น ทีมหน้าร้าน"
            value={formData.team_id}
            onChange={(event) => setFormData({ ...formData, team_id: event.target.value })}
          />

          {!editingUser && (
            <Input
              label="รหัสผ่านเริ่มต้น (อย่างน้อย 8 ตัวอักษร)"
              type="password"
              placeholder="กำหนดรหัสผ่านสำหรับล็อกอิน"
              value={formData.password}
              onChange={(event) => setFormData({ ...formData, password: event.target.value })}
            />
          )}

          {editingUser && (
            <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl mt-4">
              <div className="flex-1">
                <p className="text-sm font-black text-slate-900">สถานะการทำงาน</p>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">พนักงานยังปฏิบัติงานอยู่หรือไม่</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={formData.status === 'active'}
                  onChange={(e) => setFormData({...formData, status: e.target.checked ? 'active' : 'inactive'})}
                />
                <div className="w-11 h-6 bg-red-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
              </label>
            </div>
          )}

          {formError && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button variant="secondary" fullWidth onClick={handleCloseModal}>
              ยกเลิก
            </Button>
            <Button fullWidth onClick={handleSave} disabled={isLoading}>
              {editingUser ? 'บันทึกข้อมูล' : 'สร้างบัญชี'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        title="ยืนยันการลบพนักงาน"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-4 p-4 rounded-2xl bg-red-50 border border-red-100">
            <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-900 uppercase tracking-tight">การดำเนินการที่มีความเสี่ยง</p>
              <p className="text-sm text-red-700 mt-0.5">
                คุณกำลังจะลบพนักงาน <span className="font-bold underline">{userToDelete?.full_name}</span> ออกจากระบบอย่างถาวร
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-600 px-1">
            ข้อมูลบัญชีผู้ใช้ ประวัติการทำงาน และข้อมูลทั้งหมดของพนักงานคนนี้จะถูกลบออกจากระบบและไม่สามารถกู้คืนได้
          </p>

          <div className="flex gap-3 pt-4">
            <Button 
              variant="secondary" 
              fullWidth 
              onClick={() => setUserToDelete(null)}
              disabled={isLoading}
            >
              ยกเลิก
            </Button>
            <Button 
              variant="danger" 
              fullWidth 
              onClick={handleDeleteConfirm} 
              loading={isLoading}
            >
              ยืนยันการลบถาวร
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={!!userToResetPassword}
        onClose={handleCloseResetPasswordModal}
        title="รีเซ็ตรหัสผ่านพนักงาน"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 flex items-start gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">เปลี่ยนรหัสผ่านสำหรับล็อกอิน</p>
              <p className="text-xs text-amber-700 mt-0.5">
                บัญชีของ <span className="font-bold">{userToResetPassword?.full_name}</span> ({userToResetPassword?.email})
              </p>
            </div>
          </div>

          <Input
            id="new-pwd"
            label="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)"
            type="password"
            placeholder="กรอกรหัสผ่านใหม่ที่ต้องการตั้งค่า"
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              setResetError('');
            }}
          />

          {resetError && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {resetError}
            </div>
          )}

          {resetSuccess && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {resetSuccess}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              fullWidth
              onClick={handleCloseResetPasswordModal}
              disabled={isLoading}
            >
              {resetSuccess ? 'ปิด' : 'ยกเลิก'}
            </Button>
            {!resetSuccess && (
              <Button
                variant="primary"
                fullWidth
                onClick={handleResetPasswordConfirm}
                loading={isLoading}
              >
                ยืนยันการตั้งรหัสผ่านใหม่
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
