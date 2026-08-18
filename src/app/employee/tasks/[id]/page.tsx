'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  CheckSquare,
  FileText,
  Flag,
  ImagePlus,
  Send,
  Video,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Page, PageHeader } from '@/components/ui/Page';
import SubmissionFilesGrid, { type PreviewFile } from '@/components/ui/SubmissionFilesGrid';
import StarRating from '@/components/ui/StarRating';
import Input, { TextArea } from '@/components/ui/Input';
import {
  PRIORITY_LABELS,
  PROOF_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
  TASK_STATUS_LABELS,
} from '@/lib/constants';
import { formatThaiDate, formatRelativeTime, getCurrentDateStr } from '@/lib/dateUtils';
import {
  calculateUnitReward,
  formatThaiCurrency,
  formatUnitQuantity,
  getUnitLabel,
  getUnitMax,
  getUnitMin,
  getUnitRate,
  getUnitStep,
  isExpiredUnsubmittedTask,
  isUnitRewardTask,
  validateUnitQuantity,
} from '@/lib/taskMilestones';
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
  const [quantityInput, setQuantityInput] = useState('');
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
      <Page maxWidth="sm" className="py-8 text-center">
        <p className="text-slate-500">ไม่พบงานนี้</p>
      </Page>
    );
  }

  const isUnitReward = isUnitRewardTask(task, template);
  const unitLabel = getUnitLabel(task, template);
  const unitRate = getUnitRate(task, template);
  const unitStep = getUnitStep(task, template);
  const unitMin = getUnitMin(task, template);
  const unitMax = getUnitMax(task, template);
  const submittedQuantity = quantityInput.trim() === '' ? null : Number(quantityInput);
  const quantityReward = submittedQuantity !== null && Number.isFinite(submittedQuantity)
    ? calculateUnitReward(submittedQuantity, unitRate)
    : 0;
  const unitBoundsText = [
    unitMin !== null ? `ขั้นต่ำ ${formatUnitQuantity(unitMin)} ${unitLabel}` : null,
    unitMax !== null ? `สูงสุด ${formatUnitQuantity(unitMax)} ${unitLabel}` : null,
  ].filter((item): item is string => Boolean(item)).join(' · ');

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
    if (isExpiredUnsubmittedTask(task, getCurrentDateStr())) {
      setSubmitError('งานนี้เลยกำหนดส่งแล้ว ระบบไม่อนุญาตให้ส่งย้อนหลัง');
      return;
    }

    const quantityValidation = validateUnitQuantity(submittedQuantity, task, template);
    if (!quantityValidation.valid) {
      setSubmitError(quantityValidation.message || `กรุณากรอกจำนวน${unitLabel}ที่ทำได้`);
      return;
    }

    setSubmitting(true);

    const needsApproval = task.requires_approval ?? template?.requires_approval ?? false;
    const finalSubmittedQuantity = isUnitReward ? Number(quantityInput) : null;
    const approvedQuantity = isUnitReward && !needsApproval ? finalSubmittedQuantity : null;
    const approvedRewardAmount = approvedQuantity !== null
      ? calculateUnitReward(approvedQuantity, unitRate)
      : null;

    const submission = await taskStore.addSubmission({
      task_id: task.id,
      submitted_by: currentUser.id,
      note,
      review_status: needsApproval ? 'pending' : 'approved',
      submitted_quantity: finalSubmittedQuantity,
      approved_quantity: approvedQuantity,
      approved_reward_amount: approvedRewardAmount,
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

    await taskStore.updateTaskStatus(task.id, needsApproval ? 'submitted' : 'approved', {
      submitted_quantity: finalSubmittedQuantity,
      approved_quantity: approvedQuantity,
      approved_reward_amount: approvedRewardAmount,
    });
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

    if (isExpiredUnsubmittedTask(task, getCurrentDateStr())) {
      return false;
    }

    if (!validateUnitQuantity(submittedQuantity, task, template).valid) {
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
      <Page maxWidth="sm" className="space-y-4 pb-24">
        <Card className="p-6">
          <div className="flex flex-col items-center py-6 text-center">
            <div className="mb-4 rounded-2xl bg-emerald-100 p-4">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
            <h3 className="mb-1 text-lg font-semibold text-slate-900">ส่งงานเรียบร้อยแล้ว</h3>
            <p className="text-sm text-slate-500">
              {template?.requires_approval ? 'รอผู้จัดการตรวจสอบ' : 'งานเสร็จสมบูรณ์'}
            </p>
            <div className="mt-4 flex w-full gap-3">
              <Button variant="outline" fullWidth onClick={() => router.push('/employee/tasks')}>
                กลับหน้างาน
              </Button>
              <Button fullWidth onClick={() => router.push('/employee')}>
                หน้าแรก
              </Button>
            </div>
          </div>
        </Card>
      </Page>
    );
  }

  return (
    <Page maxWidth="sm" className="space-y-5 pb-24">
      <PageHeader
        title={task.title || template?.title || 'งาน'}
        description={`กำหนด ${formatThaiDate(task.due_date)}`}
        action={(
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => router.back()}>
            กลับ
          </Button>
        )}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={getStatusVariant(task.status) as 'success' | 'warning' | 'danger' | 'info' | 'default'}>
          {TASK_STATUS_LABELS[task.status]}
        </Badge>
        {(task.priority || template?.priority) && (
          <Badge variant={(task.priority || template?.priority) === 'critical' ? 'danger' : 'info'}>
            <Flag className="h-3 w-3" />
            ระดับ {PRIORITY_LABELS[(task.priority || template?.priority || 'medium') as Priority]}
          </Badge>
        )}
      </div>

      <Card className="p-4">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-slate-50 p-2.5 text-slate-400">
            <FileText className="h-5 w-5" />
          </div>
          <h2 className="text-sm font-semibold text-slate-950">รายละเอียดงาน</h2>
        </div>
        
        {(task.description || template?.description) && (
          <p className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-sm leading-6 text-slate-600">
            {task.description || template?.description}
          </p>
        )}
        
        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
          <p className="text-xs font-medium text-slate-500">หลักฐานที่ต้องส่ง:</p>
          <Badge variant="default" className="bg-primary-50 text-primary-700">
            {PROOF_TYPE_LABELS[proofRequired]}
          </Badge>
        </div>
      </Card>

      {task.checklist_state && task.checklist_state.length > 0 && (
        <div className="space-y-3">
          <h2 className="px-1 text-sm font-semibold text-slate-950">รายการที่ต้องดำเนินการ</h2>
          <Card padding="none" className="overflow-hidden">
            <div className="divide-y divide-slate-100">
              {task.checklist_state.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleChecklistToggle(item.id)}
                  disabled={task.status === 'approved' || task.status === 'submitted'}
                  className={`
                    flex w-full items-center gap-4 px-5 py-4 text-left transition-colors
                    ${item.completed ? 'bg-emerald-50/30' : 'hover:bg-slate-50'}
                    disabled:opacity-70
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
        <div className="space-y-3">
          <h2 className="px-1 text-sm font-semibold text-slate-950">ส่งหลักฐาน</h2>
          <Card className="p-4">
            <div className="space-y-5">
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
                    type="button"
                    onClick={openProofPicker}
                    className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 py-8 transition-colors hover:border-primary-400 hover:bg-primary-50/30"
                  >
                    <div className="rounded-full bg-primary-50 p-4 text-primary-600 shadow-sm">
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

              {isUnitReward && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                  <Input
                    label={`จำนวน${unitLabel}ที่ทำได้`}
                    type="number"
                    min={unitMin ?? 0}
                    max={unitMax ?? undefined}
                    step={unitStep}
                    value={quantityInput}
                    onChange={(event) => setQuantityInput(event.target.value)}
                    helperText={[
                      `อัตรา ${formatThaiCurrency(unitRate)}/${unitLabel}`,
                      unitBoundsText || null,
                      `ประมาณ ${formatThaiCurrency(quantityReward)}`,
                    ].filter((item): item is string => Boolean(item)).join(' · ')}
                  />
                </div>
              )}

              <div className="space-y-2">
                <TextArea
                  id="proof-note"
                  label="หมายเหตุ (ไม่บังคับ)"
                  placeholder="ระบุรายละเอียดเพิ่มเติมถึงผู้จัดการ..."
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                />
              </div>

              <div className="pt-2">
                <Button
                  fullWidth
                  size="lg"
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
        <div className="space-y-3">
          <h2 className="px-1 text-sm font-semibold text-slate-950">ประวัติการส่งงาน</h2>
          <div className="space-y-3">
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
                <Card key={submission.id} className="overflow-hidden p-0">
                  <div className={`h-1.5 w-full ${
                    reviewVariant === 'success' ? 'bg-emerald-500' :
                    reviewVariant === 'danger' ? 'bg-red-500' : 'bg-amber-500'
                  }`} />
                  
                  <div className="space-y-4 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant={reviewVariant} size="sm" dot>
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
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-slate-500">ความคิดเห็นจากผู้จัดการ</p>
                            {feedback.rating != null && (
                              <StarRating value={feedback.rating} readOnly size="sm" />
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-600">
                              {reviewer?.full_name?.charAt(0) || 'M'}
                            </div>
                            <div>
                               <p className="line-clamp-2 text-sm font-semibold text-slate-900">
                                 {feedback.comment || 'ไม่มีความเห็นเพิ่มเติม'}
                               </p>
                               <p className="mt-0.5 text-xs text-slate-500">ตรวจโดย {reviewer?.full_name || 'System'}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </Page>
  );
}
