'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useMemo } from 'react';
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
  User, AlertTriangle, Send, Camera, Zap, Clock, Users, TrendingUp
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
    // Modal will stay open for a brief moment to show success state
    setTimeout(() => {
      setSuccess(false);
      setIsModalOpen(false);
    }, 1500);
  };

  // Helper for priority scaling
  const getPriorityWeight = (priority: Priority) => {
    switch(priority) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  };

  const workloadIntensity = useMemo(() => {
    const todayTasks = taskStore.tasks.filter(t => isSameCalendarDate(t.due_date, getCurrentDateStr()));
    const totalWeight = todayTasks.reduce((acc, t) => acc + getPriorityWeight(t.priority || 'medium'), 0);
    const maxPossible = todayTasks.length * 4;
    return maxPossible > 0 ? Math.round((totalWeight / maxPossible) * 100) : 0;
  }, [taskStore.tasks]);

  return (
    <div className="space-y-8 animate-fade-in pb-20 max-w-[1600px] mx-auto">
      {/* Strategic Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 border-b border-slate-100 pb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-4">
             <div className="h-14 w-14 rounded-3xl bg-slate-900 flex items-center justify-center text-primary-400 shadow-2xl shadow-slate-200">
                <ClipboardList className="w-7 h-7 fill-primary-400/20" />
             </div>
             <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">ศูนย์กระจายงานพนักงาน</h1>
                <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                   ระบบจัดการงานหลัก • <span className="text-emerald-500 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> กำลังเชื่อมต่อ</span>
                </p>
             </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <div className="hidden sm:flex items-center gap-4 px-6 border-r border-slate-100">
             <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">สถานะคิวงาน</p>
                <p className="text-sm font-black text-slate-900 flex items-center gap-2">
                   {taskStore.tasks.filter(t => t.status === 'pending').length} <span className="text-[10px] text-amber-500 font-black uppercase">รอดำเนินการ</span>
                </p>
             </div>
             <div className="h-8 w-px bg-slate-100 mx-2" />
             <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">สภาวะการทำงาน</p>
                <div className="flex items-center gap-2">
                   <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-600 rounded-full" style={{ width: `${workloadIntensity}%` }} />
                   </div>
                   <span className="text-sm font-black text-slate-900">{workloadIntensity}%</span>
                </div>
             </div>
          </div>
          <Button onClick={() => setIsModalOpen(true)} className="h-12 px-8 rounded-full shadow-xl shadow-primary-900/10 active:scale-95" icon={<Plus className="w-4 h-4 mr-2" />}>
            มอบหมายงานใหม่
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Aspect: Tactical Intelligence */}
        <div className="xl:col-span-3 space-y-6 lg:sticky lg:top-24">
           {/* Workload Pulse */}
           <Card className="rounded-[2.5rem] border-slate-100 shadow-sm p-8 bg-slate-900 text-white relative overflow-hidden group">
              <div className="absolute right-0 top-0 translate-x-1/2 -translate-y-1/2 h-32 w-32 bg-primary-500/10 rounded-full blur-3xl transition-transform group-hover:scale-150" />
              <div className="relative z-10 space-y-6">
                 <div className="bg-white/10 w-fit p-3 rounded-2xl border border-white/10">
                    <Zap className="w-5 h-5 text-primary-400 fill-primary-400" />
                 </div>
                 <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">สถานะการมอบหมายงาน</h3>
                    <p className="text-3xl font-black tracking-tight">สภาวะการทำงานจริง</p>
                 </div>
                 <div className="space-y-4">
                    <div className="space-y-1">
                       <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-1">
                          <span>ภาระงานปัจจุบัน</span>
                          <span className="text-primary-400">{workloadIntensity}%</span>
                       </div>
                       <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                          <div className="h-full bg-primary-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-all duration-1000" style={{ width: `${workloadIntensity}%` }} />
                       </div>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed italic">
                       &ldquo;ภาระงานปัจจุบันอยู่ในระดับ {workloadIntensity > 70 ? 'สูง' : workloadIntensity > 40 ? 'ปานกลาง' : 'ปกติ'} และกำลังติดตามงานสำคัญ.&rdquo;
                    </p>
                 </div>
              </div>
           </Card>

           {/* Priority Snapshot */}
           <Card className="rounded-[2.5rem] border-slate-100 shadow-sm p-8 bg-white space-y-6">
              <div className="flex items-center gap-3">
                 <div className="p-2.5 bg-slate-50 text-slate-400 rounded-xl">
                    <CalendarCheck className="w-5 h-5" />
                 </div>
                 <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">ภาพรวมสถิติ</h2>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                 <div className="p-5 rounded-3xl bg-slate-50 border border-slate-100 group hover:border-primary-200 transition-all">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">งานเร่งด่วน</p>
                    <div className="flex items-center justify-between">
                       <p className="text-2xl font-black text-slate-900">{taskStore.tasks.filter(t => t.priority === 'critical' && t.status !== 'approved').length}</p>
                       <div className={`h-2.5 w-2.5 rounded-full bg-red-500 ${taskStore.tasks.some(t => t.priority === 'critical' && t.status !== 'approved') ? 'animate-pulse' : ''}`} />
                    </div>
                 </div>
                 <div className="p-5 rounded-3xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">พนักงานที่ได้รับงาน</p>
                    <div className="flex items-center justify-between">
                       <p className="text-2xl font-black text-slate-900">{new Set(taskStore.tasks.filter(t => t.status !== 'approved').map(t => t.assigned_to)).size}</p>
                       <Users className="w-5 h-5 text-slate-300" />
                    </div>
                 </div>
              </div>
           </Card>
        </div>

        {/* Right Aspect: Task Registry */}
        <div className="xl:col-span-9 space-y-8">
           <Card className="rounded-[3rem] border-slate-100 shadow-sm overflow-hidden p-0" padding="none">
              <div className="p-8 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                 <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">บันทึกการมอบหมายงาน</h2>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">บันทึกการส่งงานแบบเรียลไทม์</p>
                 </div>
                 <div className="flex gap-2">
                    <Badge variant="info" className="font-black text-[10px] uppercase">{taskStore.tasks.length} รายการ</Badge>
                 </div>
              </div>
              
              <div className="overflow-x-auto">
                 <table className="w-full text-left min-w-[900px]">
                    <thead>
                       <tr className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 bg-slate-50/50">
                          <th className="px-8 py-5">ผู้รับผิดชอบ</th>
                          <th className="px-6 py-5">รายละเอียด / หัวข้องาน</th>
                          <th className="px-6 py-5">ข้อกำหนดหลักฐาน</th>
                          <th className="px-6 py-5">กำหนดส่ง</th>
                          <th className="px-8 py-5 text-right">สถานะงาน</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {taskStore.tasks.slice().reverse().map((task) => {
                          const emp = employeeStore.getUserById(task.assigned_to);
                          const isDeadlineSoon = !isSameCalendarDate(task.due_date, getCurrentDateStr()) && new Date(task.due_date).getTime() < new Date().getTime();
                          
                          return (
                             <tr key={task.id} className="group hover:bg-slate-100/30 transition-all duration-300">
                                <td className="px-8 py-6">
                                   <div className="flex items-center gap-4">
                                      <div className="relative">
                                         {emp?.avatar_url ? (
                                           <img src={emp.avatar_url} alt="" className="w-11 h-11 rounded-2xl object-cover border-2 border-white shadow-sm ring-1 ring-slate-100" />
                                         ) : (
                                           <div className="w-11 h-11 rounded-2xl bg-primary-100 flex items-center justify-center border-2 border-white shadow-sm ring-1 ring-slate-100 group-hover:bg-primary-600 transition-colors">
                                             <User className="w-5 h-5 text-primary-600 group-hover:text-white transition-colors" />
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
                                <td className="px-6 py-6">
                                   <div className="space-y-1">
                                      <div className="flex items-center gap-3">
                                         <span className="text-sm font-black text-slate-700 leading-none group-hover:text-primary-600 transition-colors">{task.title}</span>
                                         <div className={`
                                            px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter
                                            ${task.priority === 'critical' ? 'bg-red-50 text-red-600 ring-1 ring-red-100 animate-pulse' : 
                                              task.priority === 'high' ? 'bg-orange-50 text-orange-600 ring-1 ring-orange-100' : 
                                              task.priority === 'medium' ? 'bg-primary-50 text-primary-600' : 'bg-slate-50 text-slate-400'}
                                         `}>
                                            {task.priority === 'critical' ? 'เร่งด่วน' : 
                                              task.priority === 'high' ? 'สูง' : 
                                              task.priority === 'medium' ? 'ปกติ' : 'ต่ำ'}
                                         </div>
                                      </div>
                                      <p className="text-[11px] text-slate-400 line-clamp-1 truncate max-w-[200px]">{task.description}</p>
                                   </div>
                                </td>
                                <td className="px-6 py-6">
                                   <div className="flex items-center gap-2 text-slate-400">
                                      <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-primary-50 group-hover:text-primary-600 transition-colors tooltip relative">
                                         {task.proof_type_required === 'photo' ? <Camera className="w-4 h-4" /> : 
                                          task.proof_type_required === 'video' ? <Zap className="w-4 h-4" /> : <ClipboardList className="w-4 h-4" />}
                                      </div>
                                      <span className="text-[10px] font-black uppercase tracking-widest">
                                          {task.proof_type_required === 'photo' ? 'รูปภาพ' : 
                                           task.proof_type_required === 'video' ? 'วิดีโอ' : 
                                           task.proof_type_required === 'text' ? 'ข้อความ' : 'เช็คลิสต์'}
                                       </span>
                                   </div>
                                </td>
                                <td className="px-6 py-6">
                                   <div className="flex flex-col">
                                      <div className="flex items-center gap-1.5">
                                         <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                         <span className={`text-xs font-black ${isDeadlineSoon ? 'text-red-500' : 'text-slate-600'}`}>
                                            {formatThaiDate(task.due_date)}
                                         </span>
                                      </div>
                                      {isDeadlineSoon && <span className="text-[9px] font-black uppercase text-red-400 mt-1">เลยกำหนด</span>}
                                   </div>
                                </td>
                                <td className="px-8 py-6 text-right">
                                   <Badge variant={task.status === 'approved' ? 'success' : task.status === 'pending' ? 'slate' : 'info'} className="font-black text-[9px] uppercase tracking-tighter py-1.5 px-4 shadow-sm">
                                      {task.status === 'pending' ? 'รอดำเนินการ' : 
                                       task.status === 'approved' ? 'เสร็จแล้ว' : 'กำลังทำ'}
                                   </Badge>
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
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="การมอบหมายงานเชิงปฏิบัติการ">
        <div className="bg-slate-900 rounded-[2.5rem] p-8 -m-6 mb-6 text-white relative overflow-hidden">
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
                 ส่งคำสัังใหม่ให้พนักงานรายบุคคลหรือรายสาขา ระบบจะแจ้งเตือนพนักงานทันที
              </p>
           </div>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center py-12 text-center animate-scale-in">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-emerald-900/10">
              <CheckCircle2 className="w-12 h-12 text-emerald-600" />
            </div>
            <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight">มอบหมายงานสำเร็จ</h4>
            <p className="text-sm text-slate-500 mt-2">พนักงานที่เกี่ยวข้องได้รับแจ้งเตือนเรียบร้อยแล้ว</p>
          </div>
        ) : (
          <div className="space-y-6 pt-4">
            <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">ที่มาของงาน</label>
               <div className="flex gap-4 p-1.5 bg-slate-100 rounded-2xl border border-slate-100">
                 <button 
                   onClick={() => setFormData({...formData, mode: 'template'})}
                   className={`flex-1 flex items-center justify-center gap-3 py-3 text-sm font-black uppercase tracking-tighter rounded-xl transition-all
                     ${formData.mode === 'template' ? 'bg-white shadow-md text-primary-700' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                   <ClipboardList className="w-4 h-4" /> ใช้ต้นแบบงาน
                 </button>
                 <button 
                   onClick={() => setFormData({...formData, mode: 'custom'})}
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
                onChange={(e) => setFormData({...formData, template_id: e.target.value})}
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
                    options={[
                      { value: 'low', label: 'ทั่วไป (ต่ำ)' },
                      { value: 'medium', label: 'ปกติ (กลาง)' },
                      { value: 'high', label: 'สำคัญ (สูง)' },
                      { value: 'critical', label: 'เร่งด่วน (สูงสุด)' },
                    ]}
                    value={formData.priority}
                    onChange={(e) => setFormData({...formData, priority: e.target.value as Priority})}
                  />
                  <Select 
                    label="รูปแบบหลักฐานที่ต้องการ"
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

            <div className="space-y-4 pt-4 border-t border-slate-50">
               <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">กลุ่มเป้าหมาย</label>
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
                   options={employees.map(e => ({ value: e.id, label: `${e.full_name} (${branchStore.getBranchById(e.branch_id)?.name})` }))}
                   value={formData.target_id}
                   onChange={(e) => setFormData({...formData, target_id: e.target.value})}
                   placeholder="ค้นหารายชื่อพนักงาน..."
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

            <div className="flex gap-4 pt-6">
              <Button variant="secondary" className="flex-1 h-14 rounded-2xl font-black text-xs uppercase" onClick={() => setIsModalOpen(false)}>ยกเลิก</Button>
              <Button 
                className="flex-[1.5] h-14 rounded-2xl font-black text-xs uppercase bg-slate-900 shadow-2xl shadow-slate-900/10 active:scale-95"
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
    </div>
  );
}
