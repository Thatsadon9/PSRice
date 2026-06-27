'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CheckSquare,
  FileText,
  Flag,
  ImagePlus,
  Send,
  Video,
  Zap,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import SubmissionFilesGrid, { type PreviewFile } from '@/components/ui/SubmissionFilesGrid';
import StarRating from '@/components/ui/StarRating';
import { TextArea } from '@/components/ui/Input';
import {
  PRIORITY_LABELS,
  PROOF_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
  TASK_STATUS_LABELS,
} from '@/lib/constants';
import { formatThaiDate, formatRelativeTime } from '@/lib/dateUtils';
import { parseReviewFeedback } from '@/lib/reviewFeedback';
import type { FileType, Priority, ProofType } from '@/lib/types';
import {
  buildReviewRequestNotifications,
  getReviewRecipients,
  insertNotifications,
} from '@/lib/reviewHelpers';
import { useAuthStore } from '@/store/authStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useTaskStore } from '@/store/taskStore';

interface PendingProofUpload {
  id: string;
  file: File;
  fileType: 'image' | 'video';
  previewUrl: string;
}

function getProofAccept(proofRequired: ProofType) {
  switch (proofRequired) {
    case 'photo':
      return 'image/*';
    case 'video':
      return 'video/*';
    case 'any':
      return 'image/*,video/*';
    default:
      return '';
  }
}

function isAllowedProofUpload(proofRequired: ProofType, fileType: FileType) {
  if (proofRequired === 'video') {
    return fileType === 'video';
  }

  if (proofRequired === 'photo') {
    return fileType === 'image';
  }

  if (proofRequired === 'any') {
    return fileType === 'image' || fileType === 'video';
  }

  return false;
}

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.currentUser);
  const taskStore = useTaskStore();
  const employeeStore = useEmployeeStore();

  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [proofUploads, setProofUploads] = useState<PendingProofUpload[]>([]);
  const [submitError, setSubmitError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const proofUploadsRef = useRef<PendingProofUpload[]>([]);

  const task = taskStore.getTaskById(id);
  const template = task?.template_id ? taskStore.getTemplateById(task.template_id) : null;
  const submissions = task ? taskStore.getSubmissionsByTask(task.id) : [];
  const proofRequired = (task?.proof_type_required || template?.proof_type_required || 'photo') as ProofType;

  useEffect(() => {
    proofUploadsRef.current = proofUploads;
  }, [proofUploads]);

  useEffect(() => {
    return () => {
      proofUploadsRef.current.forEach((upload) => {
        URL.revokeObjectURL(upload.previewUrl);
      });
    };
  }, []);

  const previewFiles = useMemo<PreviewFile[]>(() => {
    return proofUploads.map((upload) => ({
      id: upload.id,
      file_url: upload.previewUrl,
      file_type: upload.fileType,
      label: upload.file.name,
    }));
  }, [proofUploads]);

  if (!currentUser) return null;

  if (!task) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-slate-500">ไม่พบงานนี้</p>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'submitted':
        return 'warning';
      case 'rejected':
      case 'overdue':
        return 'danger';
      case 'in_progress':
        return 'info';
      default:
        return 'default';
    }
  };

  const handleChecklistToggle = (itemId: string) => {
    if (!task.checklist_state) return;

    const updated = task.checklist_state.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item,
    );

    void taskStore.updateChecklist(task.id, updated);

    if (task.status === 'pending') {
      void taskStore.updateTaskStatus(task.id, 'in_progress');
    }
  };

  const openProofPicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);

    if (selectedFiles.length === 0) {
      return;
    }

    const nextUploads = selectedFiles
      .map((file) => {
        const fileType: FileType = file.type.startsWith('video/') ? 'video' : 'image';

        if (!isAllowedProofUpload(proofRequired, fileType)) {
          return null;
        }

        return {
          id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          fileType,
          previewUrl: URL.createObjectURL(file),
        } satisfies PendingProofUpload;
      })
      .filter((upload): upload is PendingProofUpload => upload !== null);

    setProofUploads((currentUploads) => [...currentUploads, ...nextUploads]);
    event.target.value = '';
  };

  const removeUpload = (uploadId: string) => {
    setProofUploads((currentUploads) => {
      const target = currentUploads.find((upload) => upload.id === uploadId);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }

      return currentUploads.filter((upload) => upload.id !== uploadId);
    });
  };

  const handleSubmit = async () => {
    setSubmitError('');
    setSubmitting(true);

    const needsApproval = task.requires_approval ?? template?.requires_approval ?? false;

    const submission = await taskStore.addSubmission({
      task_id: task.id,
      submitted_by: currentUser.id,
      note,
      review_status: needsApproval ? 'pending' : 'approved',
    });

    if (!submission) {
      setSubmitError('ไม่สามารถส่งงานได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
      setSubmitting(false);
      return;
    }

    for (const upload of proofUploads) {
      await taskStore.addFile({
        submission_id: submission.id,
        file_type: upload.fileType,
        upload_blob: upload.file,
        file_name: upload.file.name,
      });
    }

    if (needsApproval) {
      const recipients = getReviewRecipients(employeeStore.users, currentUser);

      await insertNotifications(
        buildReviewRequestNotifications({
          submissionId: submission.id,
          taskId: task.id,
          taskTitle: task.title || template?.title || 'งาน',
          submitterName: currentUser.full_name,
          recipients,
        }),
      );
    }

    await taskStore.updateTaskStatus(task.id, needsApproval ? 'submitted' : 'approved');
    proofUploads.forEach((upload) => {
      URL.revokeObjectURL(upload.previewUrl);
    });
    setProofUploads([]);
    setSubmitted(true);
    setSubmitting(false);
  };

  const canSubmit = (() => {
    if (task.status === 'approved' || task.status === 'submitted') {
      return false;
    }

    const imageCount = proofUploads.filter((upload) => upload.fileType === 'image').length;
    const videoCount = proofUploads.filter((upload) => upload.fileType === 'video').length;

    if (proofRequired === 'photo') {
      return imageCount > 0;
    }

    if (proofRequired === 'video') {
      return videoCount > 0;
    }

    if (proofRequired === 'text') {
      return note.trim().length > 0;
    }

    if (proofRequired === 'checklist' && task.checklist_state) {
      return task.checklist_state.every((item) => item.completed);
    }

    if (proofRequired === 'any') {
      return note.trim().length > 0 || proofUploads.length > 0;
    }

    return true;
  })();

  const proofHint = (() => {
    switch (proofRequired) {
      case 'photo':
        return 'กรุณาแนบรูปภาพหลักฐานก่อนส่งงาน';
      case 'video':
        return 'กรุณาแนบวิดีโอหลักฐานก่อนส่งงาน';
      case 'any':
        return 'กรุณาแนบรูปภาพ วิดีโอ หรือระบุข้อความอย่างน้อย 1 อย่าง';
      case 'text':
        return 'กรุณาระบุรายละเอียดก่อนส่งงาน';
      case 'checklist':
        return 'กรุณาทำรายการตรวจสอบให้ครบก่อนส่งงาน';
      default:
        return '';
    }
  })();

  if (submitted) {
    return (
      <div className="px-4 py-4 space-y-4 animate-fade-in">
        <Card>
          <div className="flex flex-col items-center text-center py-8">
            <div className="p-4 rounded-full bg-emerald-100 mb-4">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">ส่งงานเรียบร้อยแล้ว</h3>
            <p className="text-sm text-slate-500">
              {template?.requires_approval ? 'รอผู้จัดการตรวจสอบ' : 'งานเสร็จสมบูรณ์'}
            </p>
            <div className="flex gap-3 mt-4 w-full">
              <Button variant="outline" fullWidth onClick={() => router.push('/employee/tasks')}>
                กลับหน้างาน
              </Button>
              <Button fullWidth onClick={() => router.push('/employee')}>
                หน้าแรก
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6 animate-fade-in pb-24 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-primary-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          กลับไปหน้ารายการงาน
        </button>
        <Badge
          variant={getStatusVariant(task.status) as 'success' | 'warning' | 'danger' | 'info' | 'default'}
          className="px-3 py-1 font-black uppercase text-[10px] tracking-tight"
        >
          {TASK_STATUS_LABELS[task.status]}
        </Badge>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-black text-slate-900 leading-tight">
          {task.title || template?.title || 'งาน'}
        </h1>
        <div className="flex items-center gap-3">
          {(task.priority || template?.priority) && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tight
              ${(task.priority || template?.priority) === 'critical' ? 'bg-red-50 text-red-600' :
                (task.priority || template?.priority) === 'high' ? 'bg-amber-50 text-amber-600' :
                'bg-blue-50 text-blue-600'}
            `}>
              <Flag className="w-3 h-3" />
              ระดับ {PRIORITY_LABELS[(task.priority || template?.priority || 'medium') as Priority]}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-tight">
            <Calendar className="w-3.5 h-3.5" />
            Due {formatThaiDate(task.due_date)}
          </div>
        </div>
      </div>

      <Card className="border-slate-100 shadow-xl shadow-slate-200/50 rounded-[2rem]">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-slate-50 text-slate-400 rounded-xl">
            <FileText className="w-5 h-5" />
          </div>
          <h2 className="font-black text-slate-900 uppercase text-xs tracking-widest">รายละเอียดงาน</h2>
        </div>
        
        {(task.description || template?.description) && (
          <p className="text-sm text-slate-600 leading-relaxed bg-slate-50/50 p-4 rounded-2xl border border-slate-50">
            {task.description || template?.description}
          </p>
        )}
        
        <div className="mt-4 pt-4 border-t border-slate-50 flex items-center gap-2">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">หลักฐานที่ต้องส่ง:</p>
          <Badge variant="default" className="bg-primary-50 text-primary-700 font-bold text-[10px] border-none">
            {PROOF_TYPE_LABELS[proofRequired]}
          </Badge>
        </div>
      </Card>

      {task.checklist_state && task.checklist_state.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] px-1">รายการที่ต้องดำเนินการ</h2>
          <Card padding="none" className="overflow-hidden border-slate-100 shadow-sm rounded-[2rem]">
            <div className="divide-y divide-slate-100">
              {task.checklist_state.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleChecklistToggle(item.id)}
                  disabled={task.status === 'approved' || task.status === 'submitted'}
                  className={`
                    w-full flex items-center gap-4 px-5 py-4 text-left
                    transition-all active:scale-[0.98]
                    ${item.completed ? 'bg-emerald-50/30' : 'hover:bg-slate-50'}
                    disabled:opacity-70 disabled:active:scale-100
                  `}
                >
                  <div className={`
                    w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border-2 transition-all
                    ${item.completed ? 'bg-emerald-600 border-emerald-600' : 'border-slate-200 bg-white'}
                  `}>
                    {item.completed && <CheckSquare className="w-4 h-4 text-white" />}
                  </div>
                  <span className={`text-sm font-bold transition-all ${item.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {task.status !== 'approved' && task.status !== 'submitted' && (
        <div className="space-y-4">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] px-1">ส่งหลักฐานของคุณ</h2>
          <Card className="border-slate-100 shadow-2xl shadow-primary-900/10 rounded-[2.5rem] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-100/30 rounded-full blur-3xl -mr-16 -mt-16" />
            
            <div className="relative z-10 space-y-6">
              {(proofRequired === 'photo' || proofRequired === 'video' || proofRequired === 'any') && (
                <div className="space-y-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={getProofAccept(proofRequired)}
                    capture={proofRequired === 'photo' || proofRequired === 'video' ? 'environment' : undefined}
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  {previewFiles.length > 0 && (
                    <SubmissionFilesGrid
                      files={previewFiles}
                      emptyLabel="ยังไม่มีไฟล์หลักฐาน"
                      onRemove={removeUpload}
                    />
                  )}

                  <button
                    onClick={openProofPicker}
                    className="w-full flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed border-slate-200 rounded-[2rem] hover:border-primary-400 hover:bg-primary-50/30 transition-all group"
                  >
                    <div className="p-4 bg-primary-50 text-primary-600 rounded-full group-hover:scale-110 transition-transform shadow-sm">
                      {proofRequired === 'video' ? <Video className="w-6 h-6" /> : <ImagePlus className="w-6 h-6" />}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-black text-slate-900">
                        {proofRequired === 'photo' && 'ถ่ายรูปหลักฐาน'}
                        {proofRequired === 'video' && 'ถ่ายวิดีโอหลักฐาน'}
                        {proofRequired === 'any' && 'แนบหลักฐาน (รูป/วิดีโอ)'}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">แตะเพื่อเพิ่มหลักฐานจากเครื่องหรือถ่ายใหม่</p>
                    </div>
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">หมายเหตุ (ไม่บังคับ)</label>
                <TextArea
                  id="proof-note"
                  placeholder="ระบุรายละเอียดเพิ่มเติมถึงผู้จัดการ..."
                  className="rounded-2xl border-slate-100 focus:ring-primary-100"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                />
              </div>

              <div className="pt-2">
                <Button
                  fullWidth
                  size="lg"
                  variant="none"
                  className={`h-14 rounded-2xl text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg
                    ${canSubmit 
                      ? 'bg-primary-600 text-white shadow-primary-200 hover:bg-primary-700' 
                      : 'bg-slate-100 text-slate-400 shadow-none cursor-not-allowed'}
                  `}
                  loading={submitting}
                  disabled={!canSubmit}
                  onClick={handleSubmit}
                  icon={<Send className="w-4 h-4" />}
                >
                  ส่งงานเพื่อตรวจสอบ
                </Button>

                {submitError && (
                  <p className="text-[10px] font-bold text-red-500 text-center mt-3 uppercase tracking-wider">{submitError}</p>
                )}

                {!canSubmit && proofHint && (
                  <p className="text-[10px] font-bold text-amber-500 text-center mt-3 uppercase tracking-wider">{proofHint}</p>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {submissions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] px-1">ประวัติการส่งงาน</h2>
          <div className="space-y-4">
            {submissions.map((submission) => {
              const files = taskStore.getFilesBySubmission(submission.id);
              const reviewer = submission.reviewed_by ? employeeStore.getUserById(submission.reviewed_by) : null;
              const feedback = parseReviewFeedback(submission.review_comment, submission.review_rating);

              const reviewVariant = (() => {
                switch (submission.review_status) {
                  case 'approved':
                    return 'success';
                  case 'rejected':
                    return 'danger';
                  default:
                    return 'warning';
                }
              })() as 'success' | 'danger' | 'warning';

              return (
                <Card key={submission.id} className="border-slate-100 shadow-sm rounded-[2rem] overflow-hidden p-0">
                  <div className={`h-1.5 w-full ${
                    reviewVariant === 'success' ? 'bg-emerald-500' :
                    reviewVariant === 'danger' ? 'bg-red-500' : 'bg-amber-500'
                  }`} />
                  
                  <div className="p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant={reviewVariant} size="sm" dot className="font-black uppercase text-[9px]">
                        {REVIEW_STATUS_LABELS[submission.review_status]}
                      </Badge>
                      <span className="text-[10px] font-bold text-slate-400">
                        ส่งเมื่อ {formatRelativeTime(submission.submitted_at)}
                      </span>
                    </div>

                    {submission.note && (
                      <p className="text-sm font-medium text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-50 italic">
                        &quot;{submission.note}&quot;
                      </p>
                    )}

                    {files.length > 0 && (
                      <SubmissionFilesGrid
                        files={files.map((file) => ({
                          id: file.id,
                          file_url: file.file_url,
                          file_type: file.file_type,
                        }))}
                        className="!grid-cols-1"
                      />
                    )}

                    {(feedback.rating != null || feedback.comment) && (
                      <div className="bg-slate-900 rounded-[2rem] p-5 shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-primary-500/10 rounded-full blur-2xl" />
                        
                        <div className="relative z-10 flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black text-primary-400 uppercase tracking-widest">ความคิดเห็นจากผู้จัดการ</p>
                            {feedback.rating != null && (
                              <StarRating value={feedback.rating} readOnly size="sm" />
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-xs font-black text-white shrink-0">
                              {reviewer?.full_name?.charAt(0) || 'M'}
                            </div>
                            <div>
                               <p className="text-sm font-bold text-white line-clamp-2">
                                 {feedback.comment || 'ไม่มีความเห็นเพิ่มเติม'}
                               </p>
                               <p className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">ตรวจโดย {reviewer?.full_name || 'System'}</p>
                            </div>
                          </div>
                        </div>
                        <Zap className="absolute bottom-[-10px] right-[-10px] w-16 h-16 text-white/5 rotate-12" />
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
