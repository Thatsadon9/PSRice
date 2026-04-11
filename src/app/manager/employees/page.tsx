'use client';

import { useState } from 'react';
import { useEmployeeStore } from '@/store/employeeStore';
import { useBranchStore } from '@/store/branchStore';
import { useAuthStore } from '@/store/authStore';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { UserPlus, Search, Edit2, Trash2, Building2, Mail, Shield, User } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants';
import type { User as UserType, UserRole } from '@/lib/types';

export default function EmployeeManagementPage() {
  const employeeStore = useEmployeeStore();
  const branchStore = useBranchStore();
  const { currentUser } = useAuthStore();
  
  const isAdmin = currentUser?.role === 'admin';
  
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    role: 'employee' as UserRole,
    branch_id: branchStore.branches[0]?.id || '',
    team_id: 'Team A',
    password: '',
  });

  const filteredEmployees = employeeStore.users.filter(u => 
    u.full_name.toLowerCase().includes(search.toLowerCase()) || 
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenModal = (user?: UserType) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        full_name: user.full_name || '',
        email: user.email || '',
        role: user.role,
        branch_id: user.branch_id || '',
        team_id: user.team_id || '',
        password: '',
      });
    } else {
      setEditingUser(null);
      setFormData({
        full_name: '',
        email: '',
        role: 'employee',
        branch_id: branchStore.branches[0]?.id || '',
        team_id: 'Team A',
        password: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (editingUser) {
      const { password, ...updateData } = formData;
      await employeeStore.updateUser(editingUser.id, updateData);
    } else {
      const newUser = {
        ...formData,
        phone: '',
        status: 'active' as const,
        avatar_url: '',
      };
      await employeeStore.addUser(newUser, formData.password);
    }
    setIsModalOpen(false);
  };

  const branchOptions = branchStore.branches.map(b => ({ value: b.id, label: b.name }));
  
  // Filter role options based on hierarchy
  const roleOptions = [
    ...(isAdmin ? [{ value: 'admin', label: 'Admin' }] : []),
    { value: 'manager', label: 'Manager' },
    { value: 'employee', label: 'Employee' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">จัดการพนักงาน</h1>
          <p className="text-slate-500 text-sm mt-1">เพิ่ม แก้ไข และจัดการสิทธิ์ของพนักงานในระบบ</p>
        </div>
        <Button onClick={() => handleOpenModal()} icon={<UserPlus className="w-4 h-4" />}>
          เพิ่มพนักงานใหม่
        </Button>
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <Input 
            id="search-emp"
            placeholder="ค้นหาชื่อหรืออีเมล..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
              {filteredEmployees.map(emp => {
                const branch = branchStore.getBranchById(emp.branch_id);
                // Hierarchy Check: Cannot manage admins unless you are an admin
                const canManage = isAdmin || emp.role !== 'admin';
                
                return (
                  <tr key={emp.id} className={`hover:bg-slate-50 transition-colors group ${!canManage ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {emp.avatar_url ? (
                          <img src={emp.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-slate-100 shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-xs shrink-0">
                            {emp.full_name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{emp.full_name}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3" /> {emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={emp.role === 'admin' ? 'danger' : emp.role === 'manager' ? 'warning' : 'info'}>
                        {emp.role === 'admin' ? <Shield className="w-3 h-3 mr-1" /> : <User className="w-3 h-3 mr-1" />}
                        {ROLE_LABELS[emp.role]}
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
                        <button 
                          onClick={() => handleOpenModal(emp)}
                          className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <div className="p-1.5 text-slate-300">
                          <Shield className="w-4 h-4" />
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingUser ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงานใหม่'}
      >
        <div className="space-y-4">
          <Input 
            label="ชื่อ-นามสกุล"
            placeholder="เช่น ปิยะ ธนวัฒน์"
            value={formData.full_name}
            onChange={(e) => setFormData({...formData, full_name: e.target.value})}
          />
          <Input 
            label="อีเมล (ใช้เข้าสู่ระบบ)"
            type="email"
            placeholder="example@psrice.co"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select 
              label="บทบาท"
              options={roleOptions}
              value={formData.role}
              onChange={(e) => setFormData({...formData, role: e.target.value as UserRole})}
            />
            <Select 
              label="สาขา"
              options={branchOptions}
              value={formData.branch_id}
              onChange={(e) => setFormData({...formData, branch_id: e.target.value})}
            />
          </div>
          <Input 
            label="ทีม/กลุ่มงาน"
            placeholder="เช่น Team A"
            value={formData.team_id}
            onChange={(e) => setFormData({...formData, team_id: e.target.value})}
          />
          
          {!editingUser && (
            <Input 
              label="รหัสผ่านเริ่มต้น (อย่างน้อย 6 ตัวอักษร)"
              type="password"
              placeholder="กำหนดรหัสผ่านสำหรับล็อกอิน"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
            />
          )}
          
          <div className="flex gap-3 pt-4">
            <Button variant="secondary" fullWidth onClick={() => setIsModalOpen(false)}>ยกเลิก</Button>
            <Button fullWidth onClick={handleSave}>บันทึกข้อมูล</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
