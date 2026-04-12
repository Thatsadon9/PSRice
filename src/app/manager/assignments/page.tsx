'use client';
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
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
import { 
  CalendarCheck, Plus, Calendar,
  Building2, ClipboardList, CheckCircle2,
  User, AlertTriangle, Send
} from 'lucide-react';
import { formatThaiDate, getCurrentDateStr, isSameCalendarDate } from '@/lib/dateUtils';
import type { Priority, ProofType, Task } from '@/lib/types';

type AssignmentMode = 'template' | 'custom';
type AssignmentTarget = 'employee' | 'branch';

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
}

type TaskDraft = Omit<Task, 'id' | 'created_at' | 'assigned_to' | 'due_date' | 'status'>;

export default function AssignmentsPage() {
  const taskStore = useTaskStore();
  const employeeStore = useEmployeeStore();
  const branchStore = useBranchStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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
  });

  const templates = taskStore.templates;
  const employees = employeeStore.getEmployees();
  const branches = branchStore.branches;

  const handleAssign = async () => {
    setLoading(true);
    
    let baseTaskData: TaskDraft;
    
    if (formData.mode === 'template') {
      const template = taskStore.getTemplateById(formData.template_id);
      if (!template) {
        setLoading(false);
        return;
      }
      baseTaskData = {
        template_id: template.id,
        title: template.title,
        description: template.description,
        priority: template.priority,
        proof_type_required: template.proof_type_required,
        checklist_state: template.checklist_json?.map(item => ({ ...item })),
      };
    } else {
      baseTaskData = {
        title: formData.title,
        description: formData.description,
        priority: formData.priority,
        proof_type_required: formData.proof_type_required,
      };
    }

    const targets = formData.target_type === 'employee'
      ? [formData.target_id]
      : employeeStore.getUsersByBranch(formData.target_id).filter(u => u.role === 'employee').map(u => u.id);

    // Run all task creations and notifications
    const pTasks = targets.map(async (userId) => {
      const newTask: Omit<Task, 'id' | 'created_at'> = {
        ...baseTaskData,
        assigned_to: userId,
        due_date: formData.due_date,
        status: 'pending' as const,
      };
      
      const success = await taskStore.addTask(newTask);
      
      // If task creation is successful, trigger a real-time notification
      if (success) {
        await supabase.from('notifications').insert({
          user_id: userId,
          title: 'งานใหม่รอดำเนินการ',
          message: `ผู้จัดการมอบหมายงาน "${newTask.title}" ให้คุณ (กำหนดส่ง: ${formatThaiDate(newTask.due_date)})`,
          type: 'task',
          link: '/employee/tasks'
        });
      }
      return success;
    });

    await Promise.all(pTasks);

    setLoading(false);
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setIsModalOpen(false);
    }, 1500);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">มอบหมายงาน</h1>
          <p className="text-slate-500 text-sm mt-1">ส่งงานให้พนักงานรายบุคคลหรือรายสาขา</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} icon={<Plus className="w-4 h-4" />}>
          มอบหมายงานใหม่
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Assignments Summary */}
        <Card className="lg:col-span-1 h-fit">
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-primary-600" />
            สรุปการมอบหมาย
          </h3>
          <div className="space-y-4">
             <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">งานที่มอบหมายแล้ววันนี้</p>
                <p className="text-xl font-bold text-slate-900">
                  {taskStore.tasks.filter((task) => isSameCalendarDate(task.due_date, getCurrentDateStr())).length} งาน
                </p>
             </div>
             <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">พนักงานที่ได้รับงาน</p>
                <p className="text-xl font-bold text-slate-900">
                  {new Set(taskStore.tasks.map(t => t.assigned_to)).size} คน
                </p>
             </div>
          </div>
        </Card>

        {/* Recent Tasks List */}
        <Card className="lg:col-span-2" padding="none">
           <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-900">รายการงานที่มอบหมายล่าสุด</h3>
              <Badge variant="info">{taskStore.tasks.length} รายการ</Badge>
           </div>
           <div className="overflow-x-auto">
              <table className="w-full text-left">
                 <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                       <th className="px-5 py-3">งาน / ผู้รับผิดชอบ</th>
                       <th className="px-5 py-3">กำหนดส่ง</th>
                       <th className="px-5 py-3">สถานะ</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                    {taskStore.tasks.slice(-8).reverse().map(task => {
                       const emp = employeeStore.getUserById(task.assigned_to);
                       const tmpl = task.template_id ? taskStore.getTemplateById(task.template_id) : null;
                       return (
                          <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                             <td className="px-5 py-3">
                                <div className="flex items-center gap-3">
                                   {emp?.avatar_url ? (
                                     <img src={emp.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border border-slate-100 shrink-0" />
                                   ) : (
                                     <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                                       <User className="w-4 h-4 text-primary-600" />
                                     </div>
                                   )}
                                   <div className="flex flex-col">
                                      <span className="text-sm font-semibold text-slate-900 line-clamp-1">{task.title || tmpl?.title}</span>
                                      <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">{emp?.full_name}</span>
                                   </div>
                                </div>
                             </td>
                             <td className="px-5 py-3">
                                <div className="text-xs text-slate-600 flex items-center gap-1">
                                   <Calendar className="w-3.5 h-3.5" />
                                   {formatThaiDate(task.due_date)}
                                </div>
                             </td>
                             <td className="px-5 py-3">
                                <Badge variant={task.status === 'approved' ? 'success' : task.status === 'pending' ? 'slate' : 'info'} size="sm">
                                   {task.status === 'pending' ? 'รอดำเนินการ' : 
                                    task.status === 'approved' ? 'เสร็จแล้ว' : 'กำลังทำ'}
                                </Badge>
                             </td>
                          </tr>
                       )
                    })}
                 </tbody>
              </table>
           </div>
        </Card>
      </div>

      {/* Assignment Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="มอบหมายงาน">
        {success ? (
          <div className="flex flex-col items-center justify-center py-8 text-center animate-scale-in">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <h4 className="text-lg font-bold text-slate-900">มอบหมายงานสำเร็จ</h4>
            <p className="text-sm text-slate-500">พนักงานได้รับการแจ้งเตือนแล้ว</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-4 p-1 bg-slate-100 rounded-lg">
              <button 
                onClick={() => setFormData({...formData, mode: 'template'})}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all
                  ${formData.mode === 'template' ? 'bg-white shadow-sm text-primary-700' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <ClipboardList className="w-4 h-4" /> ใช้ต้นแบบ
              </button>
              <button 
                onClick={() => setFormData({...formData, mode: 'custom'})}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all
                  ${formData.mode === 'custom' ? 'bg-white shadow-sm text-primary-700' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Plus className="w-4 h-4" /> สร้างงานชั่วคราว
              </button>
            </div>

            {formData.mode === 'template' ? (
              <Select 
                label="เลือกต้นแบบงาน (Template)"
                options={templates.map(t => ({ value: t.id, label: t.title }))}
                value={formData.template_id}
                onChange={(e) => setFormData({...formData, template_id: e.target.value})}
                placeholder="กรุณาเลือกงาน"
              />
            ) : (
              <div className="space-y-4 pt-2">
                <Input 
                  label="หัวข้องาน"
                  placeholder="เช่น ตรวจเช็คเครื่องปรับอากาศ"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                />
                <Input 
                  label="รายละเอียดงาน"
                  placeholder="ระบุสิ่งที่ต้องทำ..."
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Select 
                    label="ความสำคัญ"
                    options={[
                      { value: 'low', label: 'ต่ำ' },
                      { value: 'medium', label: 'กลาง' },
                      { value: 'high', label: 'สูง' },
                      { value: 'critical', label: 'วิกฤต' },
                    ]}
                    value={formData.priority}
                    onChange={(e) => setFormData({...formData, priority: e.target.value as Priority})}
                  />
                  <Select 
                    label="หลักฐานที่ต้องการ"
                    options={[
                      { value: 'photo', label: 'รูปภาพ' },
                      { value: 'video', label: 'วิดีโอ' },
                      { value: 'text', label: 'ข้อความ' },
                    ]}
                    value={formData.proof_type_required}
                    onChange={(e) => setFormData({...formData, proof_type_required: e.target.value as ProofType})}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">เป้าหมายการมอบหมาย</label>
              <div className="flex gap-4 p-1 bg-slate-100 rounded-lg">
                <button 
                  onClick={() => setFormData({...formData, target_type: 'employee', target_id: ''})}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all
                    ${formData.target_type === 'employee' ? 'bg-white shadow-sm text-primary-700' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <User className="w-4 h-4" /> รายบุคคล
                </button>
                <button 
                  onClick={() => setFormData({...formData, target_type: 'branch', target_id: ''})}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all
                    ${formData.target_type === 'branch' ? 'bg-white shadow-sm text-primary-700' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Building2 className="w-4 h-4" /> รายสาขา
                </button>
              </div>
            </div>

            {formData.target_type === 'employee' ? (
              <Select 
                label="เลือกพนักงาน"
                options={employees.map(e => ({ value: e.id, label: `${e.full_name} (${branchStore.getBranchById(e.branch_id)?.name})` }))}
                value={formData.target_id}
                onChange={(e) => setFormData({...formData, target_id: e.target.value})}
                placeholder="ค้นหารายชื่อ"
              />
            ) : (
              <Select 
                label="เลือกสาขา"
                options={branches.map(b => ({ value: b.id, label: b.name }))}
                value={formData.target_id}
                onChange={(e) => setFormData({...formData, target_id: e.target.value})}
                placeholder="เลือกสาขาเป้าหมาย"
              />
            )}

            <Input 
              label="กำหนดส่ง (Due Date)"
              type="date"
              icon={<Calendar className="w-4 h-4" />}
              value={formData.due_date}
              onChange={(e) => setFormData({...formData, due_date: e.target.value})}
            />

            {formData.target_type === 'branch' && formData.target_id && (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                   <p className="text-xs font-bold text-amber-900">สรุปการมอบหมายแบบกลุ่ม</p>
                   <p className="text-[10px] text-amber-800">
                     งานจะถูกมอบหมายให้พนักงานทุกคนในสาขา **{branchStore.getBranchById(formData.target_id)?.name}** 
                     จำนวน {employeeStore.getUsersByBranch(formData.target_id).filter(u => u.role === 'employee').length} คน
                   </p>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-6">
              <Button variant="secondary" fullWidth onClick={() => setIsModalOpen(false)}>ยกเลิก</Button>
              <Button 
                fullWidth 
                loading={loading}
                disabled={formData.mode === 'template' ? (!formData.template_id || !formData.target_id) : (!formData.title || !formData.target_id)}
                onClick={handleAssign}
                icon={<Send className="w-4 h-4" />}
              >
                ยืนยันการสัังงาน
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
