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
  Square,
  Video,
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

  const getPriorityVariant = (priority?: string) => {
    switch (priority) {
      case 'critical':
        return 'danger';
      case 'high':
        return 'warning';
      case 'medium':
        return 'info';
      default:
        return 'slate';
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

    const submission = await taskStore.addSubmission({
      task_id: task.id,
      submitted_by: currentUser.id,
      note,
      review_status: template?.requires_approval ? 'pending' : 'approved',
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

    if (template?.requires_approval) {
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

    await taskStore.updateTaskStatus(task.id, template?.requires_approval ? 'submitted' : 'approved');
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
    <div className="px-4 py-4 space-y-4 animate-fade-in">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-primary-700 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        กลับ
      </button>

      <div>
        <h1 className="text-lg font-bold text-slate-900">{task.title || template?.title || 'งาน'}</h1>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge
            variant={getStatusVariant(task.status) as 'success' | 'warning' | 'danger' | 'info' | 'default'}
            size="md"
            dot
          >
            {TASK_STATUS_LABELS[task.status]}
          </Badge>
          {(task.priority || template?.priority) && (
            <Badge
              variant={getPriorityVariant(task.priority || template?.priority) as 'danger' | 'warning' | 'info' | 'slate'}
              size="md"
            >
              <Flag className="w-3 h-3" />
              {PRIORITY_LABELS[(task.priority || template?.priority || 'medium') as Priority]}
            </Badge>
          )}
        </div>
      </div>

      <Card>
        {(task.description || template?.description) && (
          <p className="text-sm text-slate-600 mb-3">{task.description || template?.description}</p>
        )}
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500">กำหนดส่ง:</span>
            <span className="font-medium">{formatThaiDate(task.due_date)}</span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500">หลักฐานที่ต้องการ:</span>
            <span className="font-medium">{PROOF_TYPE_LABELS[proofRequired]}</span>
          </div>
        </div>
      </Card>

      {task.checklist_state && task.checklist_state.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            รายการตรวจสอบ ({task.checklist_state.filter((item) => item.completed).length}/{task.checklist_state.length})
          </h3>
          <div className="space-y-1">
            {task.checklist_state.map((item) => (
              <button
                key={item.id}
                onClick={() => handleChecklistToggle(item.id)}
                disabled={task.status === 'approved' || task.status === 'submitted'}
                className={`
                  w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left
                  transition-colors duration-150
                  ${item.completed ? 'bg-emerald-50' : 'hover:bg-slate-50'}
                  disabled:opacity-70
                `}
              >
                {item.completed ? (
                  <CheckSquare className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-5 h-5 text-slate-300 flex-shrink-0 mt-0.5" />
                )}
                <span className={`text-sm ${item.completed ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {task.status !== 'approved' && task.status !== 'submitted' && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">ส่งหลักฐาน</h3>

          {(proofRequired === 'photo' || proofRequired === 'video' || proofRequired === 'any') && (
            <div className="space-y-3 mb-4">
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

              <Button
                variant="outline"
                size="sm"
                fullWidth
                onClick={openProofPicker}
                icon={proofRequired === 'video' ? <Video className="w-4 h-4" /> : <ImagePlus className="w-4 h-4" />}
              >
                {proofRequired === 'photo' && 'เพิ่มรูปหลักฐาน'}
                {proofRequired === 'video' && 'เพิ่มวิดีโอหลักฐาน'}
                {proofRequired === 'any' && 'เพิ่มรูปภาพหรือวิดีโอ'}
              </Button>
            </div>
          )}

          <TextArea
            id="proof-note"
            label="หมายเหตุ"
            placeholder="ระบุรายละเอียดเพิ่มเติม..."
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
          />

          <Button
            fullWidth
            size="lg"
            className="mt-4"
            loading={submitting}
            disabled={!canSubmit}
            onClick={handleSubmit}
            icon={<Send className="w-4 h-4" />}
          >
            ส่งงาน
          </Button>

          {submitError && (
            <p className="text-xs text-red-600 text-center mt-2">{submitError}</p>
          )}

          {!canSubmit && proofHint && (
            <p className="text-xs text-amber-600 text-center mt-2">{proofHint}</p>
          )}
        </Card>
      )}

      {submissions.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">ประวัติการส่ง</h3>
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
                <div key={submission.id} className="border border-slate-100 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant={reviewVariant} size="sm" dot>
                      {REVIEW_STATUS_LABELS[submission.review_status]}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {formatRelativeTime(submission.submitted_at)}
                    </span>
                  </div>

                  {submission.note && <p className="text-sm text-slate-600">{submission.note}</p>}

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
                    <div className="bg-slate-50 rounded-lg px-3 py-2 mt-2 space-y-2">
                      <p className="text-xs text-slate-500">
                        ความเห็นจาก {reviewer?.full_name || 'ผู้จัดการ'}:
                      </p>
                      {feedback.rating != null && (
                        <StarRating value={feedback.rating} readOnly size="sm" />
                      )}
                      {feedback.comment && (
                        <p className="text-sm text-slate-700">{feedback.comment}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
