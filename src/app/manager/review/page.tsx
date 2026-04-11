'use client';

import { useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useAuthStore } from '@/store/authStore';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { TextArea } from '@/components/ui/Input';
import { 
  CheckCircle2, XCircle, Clock, Calendar, 
  User, FileText, Camera, CheckSquare, MessageSquare, 
  Search, Filter, Download
} from 'lucide-react';
import { formatThaiDateTime } from '@/lib/dateUtils';
import type { TaskSubmission, TaskStatus, ReviewStatus } from '@/lib/types';

export default function ManagerReviewPage() {
   const taskStore = useTaskStore();
   const employeeStore = useEmployeeStore();
   const { currentUser } = useAuthStore();
   
   const pendingSubmissions = taskStore.getPendingSubmissions();
   
   const [selectedSub, setSelectedSub] = useState<TaskSubmission | null>(null);
   const [reviewComment, setReviewComment] = useState('');
   const [isModalOpen, setIsModalOpen] = useState(false);
   const [processing, setProcessing] = useState(false);

   const handleOpenReview = (sub: TaskSubmission) => {
      setSelectedSub(sub);
      setReviewComment('');
      setIsModalOpen(true);
   };

   const handleReview = async (status: ReviewStatus) => {
      if (!selectedSub || !currentUser) return;
      
      setProcessing(true);
      // Simulate API call
      await new Promise(r => setTimeout(r, 800));

      // 1. Update the submission record
      taskStore.reviewSubmission(selectedSub.id, status, reviewComment, currentUser.id);

      // 2. Update the parent task status
      const newStatus: TaskStatus = status === 'approved' ? 'approved' : 'rejected';
      taskStore.updateTaskStatus(selectedSub.task_id, newStatus);

      setProcessing(false);
      setIsModalOpen(false);
      setSelectedSub(null);
   };

   const getSubmissionDetails = (sub: TaskSubmission | null) => {
      if (!sub) return null;
      const emp = employeeStore.getUserById(sub.submitted_by);
      const task = taskStore.getTaskById(sub.task_id);
      const template = (task && task.template_id) ? taskStore.getTemplateById(task.template_id) : null;
      const files = taskStore.getFilesBySubmission(sub.id);
      
      return { sub, emp, task, template, files };
   };

   const detailedView = getSubmissionDetails(selectedSub);

   return (
      <div className="space-y-6 animate-fade-in">
         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
               <h1 className="text-2xl font-bold text-slate-900">ตรวจงาน</h1>
               <p className="text-slate-500 text-sm mt-1">งานที่พนักงานส่งและรอการอนุมัติ ({pendingSubmissions.length})</p>
            </div>
            <div className="flex gap-2">
               <div className="bg-slate-100 rounded-lg p-1 flex">
                  <button className="px-3 py-1.5 text-xs font-bold bg-white text-primary-700 rounded shadow-sm">รอดำเนินการ</button>
                  <button className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700">ตรวจสอบแล้ว</button>
               </div>
            </div>
         </div>

         {pendingSubmissions.length === 0 ? (
            <Card className="py-16 flex flex-col items-center justify-center text-center">
               <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
               </div>
               <h3 className="text-xl font-bold text-slate-900">ไม่มีงานค้างรอตรวจ</h3>
               <p className="text-sm text-slate-500 mt-2 max-w-xs">พนักงานทำงานส่งครบถ้วนแล้ว คุณสามารถไปดูรายงานสรุปประจำวันได้</p>
            </Card>
         ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
               {pendingSubmissions.map(sub => {
                  const emp = employeeStore.getUserById(sub.submitted_by);
                  const task = taskStore.getTaskById(sub.task_id);
                  const tmpl = (task && task.template_id) ? taskStore.getTemplateById(task.template_id) : null;
                  
                  return (
                     <Card key={sub.id} className="flex flex-col relative card-hover" padding="none">
                        <div className="p-4 flex-1">
                           <div className="flex justify-between items-start mb-3">
                              <Badge variant="warning" dot>รอตรวจ</Badge>
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                 <Clock className="w-3 h-3" /> {formatThaiDateTime(sub.submitted_at)}
                              </span>
                           </div>
                           
                           <h3 className="font-bold text-slate-900 mb-2">{task?.title || tmpl?.title || 'งาน'}</h3>
                           
                           <div className="flex items-center gap-2 mb-4">
                              {emp?.avatar_url ? (
                                 <img src={emp.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover border border-slate-100 shrink-0" />
                              ) : (
                                 <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold shrink-0">
                                    {emp?.full_name.charAt(0)}
                                 </div>
                              )}
                              <span className="text-xs text-slate-600 font-medium">{emp?.full_name}</span>
                           </div>

                           {sub.note && (
                              <div className="p-2 bg-slate-50 rounded text-xs text-slate-500 italic line-clamp-2">
                                 "{sub.note}"
                              </div>
                           )}
                        </div>

                        <div className="p-3 bg-slate-50/80 border-t border-slate-100 flex gap-2">
                           <Button variant="secondary" size="sm" fullWidth onClick={() => handleOpenReview(sub)}>
                              ดูรายละเอียด
                           </Button>
                           <Button variant="primary" size="sm" fullWidth onClick={() => handleOpenReview(sub)}>
                              ตรวจงาน
                           </Button>
                        </div>
                     </Card>
                  )
               })}
            </div>
         )}

         {/* Review Detail Modal */}
         <Modal 
            isOpen={isModalOpen} 
            onClose={() => setIsModalOpen(false)} 
            title="รายละเอียดงานที่บันทึก"
         >
            {detailedView && (
               <div className="space-y-5">
                  <div className="flex items-start gap-4 p-3 bg-primary-50 rounded-xl">
                     <div className="p-2 bg-white rounded-lg text-primary-600 shadow-sm">
                        <CheckSquare className="w-6 h-6" />
                     </div>
                     <div>
                        <h4 className="font-bold text-slate-900 leading-tight">{detailedView.task?.title || detailedView.template?.title || 'งาน'}</h4>
                        <p className="text-xs text-slate-500 mt-1">ผู้ปฏิบัติงาน: {detailedView.emp?.full_name}</p>
                     </div>
                  </div>

                  <div className="space-y-4">
                     {/* Proof Container */}
                     <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 flex items-center gap-2 uppercase tracking-wider">
                           <Camera className="w-3.5 h-3.5" /> หลักฐานภาพถ่าย
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                           {detailedView.files.length > 0 ? (
                              detailedView.files.map(file => (
                                 <div key={file.id} className="aspect-square rounded-lg bg-slate-100 overflow-hidden relative group border border-slate-100">
                                    <img src={file.file_url} alt="Proof" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                       <Download className="w-5 h-5 text-white" />
                                    </div>
                                 </div>
                              ))
                           ) : (
                              <div className="col-span-2 py-8 bg-slate-50 rounded-lg flex flex-col items-center justify-center text-slate-400">
                                 <FileText className="w-8 h-8 mb-2 opacity-20" />
                                 <p className="text-xs">ไม่มีไฟล์แนบ</p>
                              </div>
                           )}
                        </div>
                     </div>

                     {/* Checklist Result */}
                     {detailedView.task?.checklist_state && (
                        <div className="space-y-2">
                           <label className="text-xs font-bold text-slate-500 flex items-center gap-2 uppercase tracking-wider">
                              <CheckCircle2 className="w-3.5 h-3.5" /> รายการตรวจสอบ
                           </label>
                           <div className="space-y-1">
                              {detailedView.task.checklist_state.map((item, idx) => (
                                 <div key={idx} className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 p-2 rounded">
                                    {item.completed ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <div className="w-4 h-4 rounded-full border border-slate-300" />}
                                    <span className={item.completed ? '' : 'text-slate-400'}>{item.label}</span>
                                 </div>
                              ))}
                           </div>
                        </div>
                     )}

                     {/* Notes */}
                     <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 flex items-center gap-2 uppercase tracking-wider">
                           <MessageSquare className="w-3.5 h-3.5" /> หมายเหตุจากพนักงาน
                        </label>
                        <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-700 italic border-l-4 border-slate-300">
                           {detailedView.sub.note || '(ไม่มีหมายเหตุ)'}
                        </div>
                     </div>

                     {/* Manager Comment Area */}
                     <div className="pt-4 border-t border-slate-100">
                        <TextArea 
                           label="ความคิดเห็นของผู้จัดการ (ระบุหากต้องแก้ไข)"
                           placeholder="เช่น รูปถ่ายไม่ชัดเจน กรุณาถ่ายใหม่..."
                           value={reviewComment}
                           onChange={(e) => setReviewComment(e.target.value)}
                           rows={3}
                        />
                     </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                     <Button 
                        variant="danger" 
                        fullWidth 
                        loading={processing}
                        onClick={() => handleReview('rejected')}
                        icon={<XCircle className="w-4 h-4" />}
                     >
                        ไม่อนุมัติ / ให้แก้ไข
                     </Button>
                     <Button 
                        variant="success" 
                        fullWidth 
                        loading={processing}
                        onClick={() => handleReview('approved')}
                        icon={<CheckCircle2 className="w-4 h-4" />}
                     >
                        อนุมัติงาน
                     </Button>
                  </div>
               </div>
            )}
         </Modal>
      </div>
   );
}
