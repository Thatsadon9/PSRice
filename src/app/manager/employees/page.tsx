'use client';

import { useMemo, useState } from 'react';
import { useEmployeeStore } from '@/store/employeeStore';
import { useBranchStore } from '@/store/branchStore';
import { useAuthStore } from '@/store/authStore';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { UserPlus, Search, Edit2, Trash2, Building2, Mail, Shield, User, AlertCircle, UserMinus, KeyRound } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants';
import type { User as UserType, UserRole } from '@/lib/types';

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

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserType | null>(null);
  const [userToResetPassword, setUserToResetPassword] = useState<UserType | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [formError, setFormError] = useState('');

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
                      className={`hover:bg-slate-50 transition-colors group ${!canManage ? 'opacity-70' : ''}`}
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
                      <td className="px-6 py-4 text-right">
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
                      className={`hover:bg-slate-50 transition-colors group ${!canManage ? 'opacity-70' : ''}`}
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
                      <td className="px-6 py-4 text-right">
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
