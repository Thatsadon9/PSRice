'use client';

import { useTaskStore } from '@/store/taskStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useAuthStore } from '@/store/authStore';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Input';
import { 
  CheckCircle2, XCircle, Clock, Calendar, 
  User, FileText, Camera, CheckSquare, MessageSquare, 
  ArrowLeft, Download
} from 'lucide-react';
import { formatThaiDateTime } from '@/lib/dateUtils';
import { useRouter, useParams } from 'next/navigation';
import { useState, use } from 'react';
import type { ReviewStatus, TaskStatus } from '@/lib/types';

export default function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
   const { id } = use(params);
   const router = useRouter();
   const taskStore = useTaskStore();
   const employeeStore = useEmployeeStore();
   const { currentUser } = useAuthStore();
   
   const submission = taskStore.submissions.find(s => s.id === id);
   const [reviewComment, setReviewComment] = useState(submission?.review_comment || '');
   const [processing, setProcessing] = useState(false);

   if (!submission) {
      return (
         <div className="flex flex-col items-center justify-center py-20">
            <h2 className="text-xl font-bold text-slate-800">ไม่พบข้อมูลการส่งงาน</h2>
            <Button className="mt-4" onClick={() => router.back()}>กลับไปหน้าตรวจงาน</Button>
         </div>
      );
   }

   const emp = employeeStore.getUserById(submission.submitted_by);
   const task = taskStore.getTaskById(submission.task_id);
   const template = (task && task.template_id) ? taskStore.getTemplateById(task.template_id) : null;
   const files = taskStore.getFilesBySubmission(submission.id);

   const handleReview = async (status: ReviewStatus) => {
      if (!currentUser) return;
      setProcessing(true);

      await taskStore.reviewSubmission(submission.id, status, reviewComment, currentUser.id);
      const newStatus: TaskStatus = status === 'approved' ? 'approved' : 'rejected';
      await taskStore.updateTaskStatus(submission.task_id, newStatus);

      setProcessing(false);
      router.back();
   };

   return (
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in pb-10">
         <button 
           onClick={() => router.back()}
           className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors"
         >
            <ArrowLeft className="w-4 h-4" /> ย้อนกลับ
         </button>

         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
               <h1 className="text-2xl font-bold text-slate-900">ตรวจงานพนักงาน</h1>
               <p className="text-slate-500 text-sm mt-1">ตรวจสอบหลักฐานและอนุมัติผลงาน</p>
            </div>
            <Badge variant={submission.review_status === 'pending' ? 'warning' : submission.review_status === 'approved' ? 'success' : 'danger'}>
               {submission.review_status === 'pending' ? 'รอตรวจ' : 
                submission.review_status === 'approved' ? 'อนุมัติแล้ว' : 'ไม่ผ่าน'}
            </Badge>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
               <Card padding="lg" className="space-y-6">
                  {/* Header Info */}
                  <div className="flex items-start gap-4 p-4 bg-primary-50 rounded-2xl border border-primary-100">
                     <div className="p-3 bg-white rounded-xl text-primary-600 shadow-sm">
                        <CheckSquare className="w-8 h-8" />
                     </div>
                     <div>
                        <h4 className="text-lg font-bold text-slate-900 leading-tight">{task?.title || template?.title || 'งาน'}</h4>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 font-medium">
                           <span className="flex items-center gap-1"><User className="w-3 h-3 text-slate-400" /> {emp?.full_name}</span>
                           <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-slate-400" /> {formatThaiDateTime(submission.submitted_at)}</span>
                        </div>
                     </div>
                  </div>

                  {/* Submission Files */}
                  <div className="space-y-3">
                     <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Camera className="w-4 h-4 text-primary-600" /> หลักฐานงาน (รูปถ่าย {files.length})
                     </label>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {files.map(file => (
                           <div key={file.id} className="group relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 aspect-video sm:aspect-square">
                              <img src={file.file_url} alt="Proof" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                 <button className="p-2 bg-white rounded-full text-slate-900 shadow-lg">
                                    <Download className="w-5 h-5" />
                                 </button>
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>

                  {/* Checklist Summary */}
                  {task?.checklist_state && (
                     <div className="space-y-3 pt-6 border-t border-slate-100">
                        <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                           <CheckSquare className="w-4 h-4 text-emerald-600" /> รายการตรวจสอบที่ส่งเค็ม
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                           {task.checklist_state.map((item, i) => (
                              <div key={i} className="flex items-center gap-3 px-4 py-3 bg-slate-50/80 rounded-xl">
                                 {item.completed ? (
                                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                                       <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    </div>
                                 ) : (
                                    <div className="w-5 h-5 rounded-full border-2 border-slate-200" />
                                 )}
                                 <span className={`text-sm ${item.completed ? 'text-slate-900' : 'text-slate-400'}`}>
                                    {item.label}
                                 </span>
                              </div>
                           ))}
                        </div>
                     </div>
                  )}

                  {/* Note */}
                  <div className="space-y-2 pt-6 border-t border-slate-100">
                     <label className="text-sm font-bold text-slate-900 flex items-center gap-2 font-mono uppercase tracking-wider opacity-60">
                        <MessageSquare className="w-3.5 h-3.5" /> พนักงานระบุว่า:
                     </label>
                     <div className="p-4 bg-slate-50 rounded-2xl text-sm text-slate-700 italic border-l-4 border-slate-300">
                        "{submission.note || 'ไม่มีระบุหมายเหตุ'}"
                     </div>
                  </div>
               </Card>
            </div>

            <div className="space-y-6">
               <Card className="sticky top-6">
                  <h3 className="font-bold text-slate-900 mb-4">สถานะการตรวจสอบ</h3>
                  
                  <div className="space-y-4">
                     <TextArea 
                        label="ผลการตรวจสอบ / ข้อเสนอแนะ"
                        placeholder="ระบุข้อความหากต้องการให้แก้ไข หรือชมเชยผลงาน..."
                        rows={4}
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        className="bg-slate-50 focus:bg-white"
                     />

                     <div className="space-y-2">
                        <Button 
                           variant="success" 
                           fullWidth 
                           loading={processing}
                           onClick={() => handleReview('approved')}
                           icon={<CheckCircle2 className="w-4 h-4" />}
                        >
                           อนุมัติผลงาน
                        </Button>
                        <Button 
                           variant="danger" 
                           fullWidth 
                           loading={processing}
                           onClick={() => handleReview('rejected')}
                           icon={<XCircle className="w-4 h-4" />}
                        >
                           ไม่ผ่าน / ให้แก้ไขใหม่
                        </Button>
                     </div>
                  </div>
                  
                  <div className="mt-6 pt-6 border-t border-slate-100">
                     <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                        เมื่อพิจารณาเรียบร้อยแล้ว สถานะของงานจะถูกอัปเดต และพนักงานจะได้รับการแจ้งเตือนผลการตรวจทันที
                     </p>
                  </div>
               </Card>
            </div>
         </div>
      </div>
   );
}
