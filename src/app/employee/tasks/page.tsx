'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Coins,
  FileText,
  Flag,
  ImagePlus,
  Send,
  Trophy,
  Video,
  Clock,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import SubmissionFilesGrid, { type PreviewFile } from '@/components/ui/SubmissionFilesGrid';
import { TextArea } from '@/components/ui/Input';
import {
  PRIORITY_LABELS,
  PROOF_TYPE_LABELS,
  TASK_STATUS_LABELS,
} from '@/lib/constants';
import { formatThaiDate } from '@/lib/dateUtils';
import {
  buildReviewRequestNotifications,
  getReviewRecipients,
  insertNotifications,
} from '@/lib/reviewHelpers';
import {
  formatThaiCurrency,
  getMilestoneReward,
  isMilestoneComplete,
  sortMilestoneTasks,
  isAttendanceTask,
} from '@/lib/taskMilestones';
import type { FileType, Priority, ProofType, Task } from '@/lib/types';
import { useAuthStore } from '@/store/authStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useTaskStore } from '@/store/taskStore';
import { useRouter } from 'next/navigation';

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
  if (proofRequired === 'video') return fileType === 'video';
  if (proofRequired === 'photo') return fileType === 'image';
  if (proofRequired === 'any') return fileType === 'image' || fileType === 'video';
  return false;
}

export default function MyTasksPage() {
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.currentUser);
  const taskStore = useTaskStore();
  const employeeStore = useEmployeeStore();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [note, setNote] = useState('');
  const [proofUploads, setProofUploads] = useState<PendingProofUpload[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const proofUploadsRef = useRef<PendingProofUpload[]>([]);

  const allTasks = useMemo(() => {
    if (!currentUser) return [];
    return sortMilestoneTasks(taskStore.getTasksByUser(currentUser.id));
  }, [currentUser, taskStore]);

  const completedTasks = allTasks.filter((task) => isMilestoneComplete(task.status));
  const currentIndex = allTasks.findIndex((task) => !isMilestoneComplete(task.status));
  const earnedReward = allTasks.reduce((sum, task) => {
    const template = task.template_id ? taskStore.getTemplateById(task.template_id) : null;
    return sum + (isMilestoneComplete(task.status) ? getMilestoneReward(task, template) : 0);
  }, 0);
  const totalReward = allTasks.reduce((sum, task) => {
    const template = task.template_id ? taskStore.getTemplateById(task.template_id) : null;
    return sum + getMilestoneReward(task, template);
  }, 0);
  const progress = allTasks.length > 0 ? Math.round((completedTasks.length / allTasks.length) * 100) : 100;
  const selectedTemplate = selectedTask?.template_id ? taskStore.getTemplateById(selectedTask.template_id) : null;
  const selectedProofRequired = (selectedTask?.proof_type_required || selectedTemplate?.proof_type_required || 'photo') as ProofType;
  const selectedReward = selectedTask ? getMilestoneReward(selectedTask, selectedTemplate) : 0;
  const previewFiles = proofUploads.map((upload) => ({
    id: upload.id,
    file_url: upload.previewUrl,
    file_type: upload.fileType,
    label: upload.file.name,
  })) satisfies PreviewFile[];

  useEffect(() => {
    proofUploadsRef.current = proofUploads;
  }, [proofUploads]);

  useEffect(() => {
    return () => {
      proofUploadsRef.current.forEach((upload) => URL.revokeObjectURL(upload.previewUrl));
    };
  }, []);

  if (!currentUser) return null;

  const openMilestone = (task: Task) => {
    proofUploads.forEach((upload) => URL.revokeObjectURL(upload.previewUrl));
    setProofUploads([]);
    setNote('');
    setSubmitError('');
    setSubmitSuccess(false);
    setSelectedTask(task);
  };

  const closeMilestone = () => {
    proofUploads.forEach((upload) => URL.revokeObjectURL(upload.previewUrl));
    setProofUploads([]);
    setSelectedTask(null);
    setSubmitError('');
    setSubmitSuccess(false);
    setNote('');
  };

  const handleChecklistToggle = (itemId: string) => {
    if (!selectedTask?.checklist_state) return;

    const updated = selectedTask.checklist_state.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item,
    );

    setSelectedTask({ ...selectedTask, checklist_state: updated });
    void taskStore.updateChecklist(selectedTask.id, updated);

    if (selectedTask.status === 'pending') {
      void taskStore.updateTaskStatus(selectedTask.id, 'in_progress');
      setSelectedTask({ ...selectedTask, status: 'in_progress', checklist_state: updated });
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    const nextUploads = selectedFiles
      .map((file) => {
        const fileType: FileType = file.type.startsWith('video/') ? 'video' : 'image';

        if (!isAllowedProofUpload(selectedProofRequired, fileType)) {
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
      if (target) URL.revokeObjectURL(target.previewUrl);
      return currentUploads.filter((upload) => upload.id !== uploadId);
    });
  };

  const canSubmit = (() => {
    if (!selectedTask || selectedTask.status === 'approved' || selectedTask.status === 'submitted') {
      return false;
    }

    const imageCount = proofUploads.filter((upload) => upload.fileType === 'image').length;
    const videoCount = proofUploads.filter((upload) => upload.fileType === 'video').length;

    if (selectedProofRequired === 'photo') return imageCount > 0;
    if (selectedProofRequired === 'video') return videoCount > 0;
    if (selectedProofRequired === 'text') return note.trim().length > 0;
    if (selectedProofRequired === 'checklist' && selectedTask.checklist_state) {
      return selectedTask.checklist_state.every((item) => item.completed);
    }
    if (selectedProofRequired === 'any') return note.trim().length > 0 || proofUploads.length > 0;
    return true;
  })();

  const handleSubmit = async () => {
    if (!selectedTask) return;

    setSubmitError('');
    setSubmitting(true);

    const submission = await taskStore.addSubmission({
      task_id: selectedTask.id,
      submitted_by: currentUser.id,
      note,
      review_status: selectedTemplate?.requires_approval ? 'pending' : 'approved',
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

    if (selectedTemplate?.requires_approval) {
      const recipients = getReviewRecipients(employeeStore.users, currentUser);
      await insertNotifications(
        buildReviewRequestNotifications({
          submissionId: submission.id,
          taskId: selectedTask.id,
          taskTitle: selectedTask.title || selectedTemplate?.title || 'งาน',
          submitterName: currentUser.full_name,
          recipients,
        }),
      );
    }

    const nextStatus = selectedTemplate?.requires_approval ? 'submitted' : 'approved';
    await taskStore.updateTaskStatus(selectedTask.id, nextStatus);
    proofUploads.forEach((upload) => URL.revokeObjectURL(upload.previewUrl));
    setProofUploads([]);
    setSelectedTask({ ...selectedTask, status: nextStatus });
    setSubmitSuccess(true);
    setSubmitting(false);
  };

  return (
    <div className="px-4 py-5 space-y-5 animate-fade-in pb-24 max-w-lg mx-auto">
      <div className="rounded-[2rem] bg-slate-900 text-white p-5 shadow-2xl shadow-slate-300/40 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl -mr-20 -mt-24" />
        <div className="relative z-10 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-tight">Milestone</h1>
              <p className="text-xs font-bold text-slate-400 mt-1">ทำงานให้ครบทีละขั้น แล้วเห็นเงินสะสมเพิ่มขึ้นเรื่อย ๆ</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-emerald-300" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl bg-white/10 border border-white/10 p-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">เงินสะสม</p>
              <p className="text-xl font-black mt-1">{formatThaiCurrency(earnedReward)}</p>
            </div>
            <div className="rounded-3xl bg-white/10 border border-white/10 p-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ทำสำเร็จ</p>
              <p className="text-xl font-black mt-1">{completedTasks.length}/{allTasks.length}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-3 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-[10px] font-bold text-slate-500">เป้าหมายรวม {formatThaiCurrency(totalReward)}</p>
          </div>
        </div>
      </div>

      {allTasks.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">ยังไม่มี Milestone ที่ได้รับมอบหมาย</p>
          </div>
        </Card>
      ) : (
        <div className="relative space-y-0">
          <div className="absolute left-[1.35rem] top-7 bottom-7 w-1 rounded-full bg-slate-200" />
          {allTasks.map((task, index) => {
            const template = task.template_id ? taskStore.getTemplateById(task.template_id) : null;
            const isComplete = isMilestoneComplete(task.status);
            const isCurrent = currentIndex === index;
            const reward = getMilestoneReward(task, template);
            const priority = (task.priority || template?.priority || 'medium') as Priority;

            return (
              <button
                key={task.id}
                type="button"
                onClick={() => {
                  if (!isComplete && isAttendanceTask(task, template)) {
                    router.push('/employee/check-in');
                  } else {
                    openMilestone(task);
                  }
                }}
                className="relative z-10 w-full flex items-start gap-4 py-3 text-left group"
              >
                <div className={`mt-2 h-11 w-11 rounded-full flex items-center justify-center shrink-0 text-sm font-black shadow-sm border-4 border-slate-50 transition-all ${
                  isComplete ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-slate-600'
                } ${isCurrent ? 'ring-4 ring-primary-100' : ''}`}>
                  {isComplete ? <CheckCircle2 className="w-5 h-5" /> : (isAttendanceTask(task, template) ? <Clock className="w-5 h-5" /> : index + 1)}
                </div>

                <div className={`flex-1 rounded-[2rem] border p-4 transition-all ${
                  isComplete
                    ? 'bg-emerald-50 border-emerald-100'
                    : 'bg-white border-slate-100 group-hover:border-slate-200'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-sm font-black line-clamp-2 ${isComplete ? 'text-emerald-900' : 'text-slate-900'}`}>
                        {task.title || template?.title || 'งาน'}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap text-[10px] font-bold text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatThaiDate(task.due_date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Flag className="w-3 h-3" />
                          {PRIORITY_LABELS[priority]}
                        </span>
                      </div>
                    </div>
                    <div className={`shrink-0 rounded-2xl px-3 py-2 ${isComplete ? 'bg-white text-emerald-700' : 'bg-slate-50 text-slate-600'}`}>
                      <div className="flex items-center gap-1 text-xs font-black">
                        <Coins className="w-3.5 h-3.5" />
                        {formatThaiCurrency(reward)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Badge variant={isComplete ? 'success' : task.status === 'overdue' || task.status === 'rejected' ? 'danger' : 'default'} size="sm">
                      {TASK_STATUS_LABELS[task.status]}
                    </Badge>
                    {isCurrent && !isComplete && (
                      <span className="text-[10px] font-black text-primary-600 bg-primary-50 px-2 py-1 rounded-full">ขั้นต่อไป</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Modal isOpen={Boolean(selectedTask)} onClose={closeMilestone} bottomSheet title="รายละเอียด Milestone">
        {selectedTask && (
          <div className="space-y-5">
            {submitSuccess ? (
              <div className="text-center py-6">
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-9 h-9 text-emerald-600" />
                </div>
                <h2 className="text-lg font-black text-slate-900">ส่งงานเรียบร้อยแล้ว</h2>
                <p className="text-sm font-bold text-slate-500 mt-1">Milestone นี้เพิ่มยอดสะสม {formatThaiCurrency(selectedReward)}</p>
                <Button className="mt-5" fullWidth onClick={closeMilestone}>กลับไปดู Milestone</Button>
              </div>
            ) : (
              <>
                <div className="rounded-[2rem] bg-slate-50 border border-slate-100 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-black text-slate-900 leading-tight">{selectedTask.title || selectedTemplate?.title || 'งาน'}</h2>
                      <p className="text-xs font-bold text-slate-500 mt-1">กำหนด {formatThaiDate(selectedTask.due_date)}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 text-emerald-700 shadow-sm">
                      <div className="flex items-center gap-1 text-sm font-black">
                        <Coins className="w-4 h-4" />
                        {formatThaiCurrency(selectedReward)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={isMilestoneComplete(selectedTask.status) ? 'success' : selectedTask.status === 'overdue' || selectedTask.status === 'rejected' ? 'danger' : 'default'} size="sm">
                      {TASK_STATUS_LABELS[selectedTask.status]}
                    </Badge>
                    <Badge variant="info" size="sm">
                      หลักฐาน: {PROOF_TYPE_LABELS[selectedProofRequired]}
                    </Badge>
                  </div>

                  {(selectedTask.description || selectedTemplate?.description) && (
                    <div className="rounded-2xl bg-white border border-slate-100 p-3">
                      <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        <FileText className="w-3.5 h-3.5" />
                        รายละเอียด
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">{selectedTask.description || selectedTemplate?.description}</p>
                    </div>
                  )}
                </div>

                {selectedTask.checklist_state && selectedTask.checklist_state.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">รายการที่ต้องทำ</p>
                    <div className="rounded-[1.5rem] border border-slate-100 overflow-hidden divide-y divide-slate-100">
                      {selectedTask.checklist_state.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          disabled={isMilestoneComplete(selectedTask.status)}
                          onClick={() => handleChecklistToggle(item.id)}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                            item.completed ? 'bg-emerald-50' : 'bg-white hover:bg-slate-50'
                          } disabled:opacity-70`}
                        >
                          <div className={`h-6 w-6 rounded-lg border-2 flex items-center justify-center ${
                            item.completed ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-200'
                          }`}>
                            {item.completed && <CheckSquare className="w-4 h-4 text-white" />}
                          </div>
                          <span className={`text-sm font-bold ${item.completed ? 'text-emerald-800 line-through' : 'text-slate-700'}`}>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!isMilestoneComplete(selectedTask.status) ? (
                  isAttendanceTask(selectedTask, selectedTemplate) ? (
                    <div className="space-y-4">
                      <div className="rounded-[2rem] bg-blue-50 border border-blue-100 p-5 text-center">
                        <Clock className="w-10 h-10 text-blue-600 mx-auto mb-3" />
                        <p className="text-sm font-black text-blue-900">เช็คอินเข้างานเพื่อรับ Milestone นี้</p>
                        <p className="text-xs font-bold text-blue-700 mt-1">ระบบจะมอบ Milestone นี้ให้อัตโนมัติเมื่อเช็คอินสำเร็จ</p>
                      </div>
                      <Button
                        fullWidth
                        size="lg"
                        className="h-14 rounded-2xl text-sm font-black gap-2 shadow-lg bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700"
                        onClick={() => router.push('/employee/check-in')}
                        icon={<Clock className="w-4 h-4" />}
                      >
                        ไปหน้าเช็คอิน
                      </Button>
                    </div>
                  ) : (
                  <div className="space-y-4">
                    {(selectedProofRequired === 'photo' || selectedProofRequired === 'video' || selectedProofRequired === 'any') && (
                      <div className="space-y-3">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept={getProofAccept(selectedProofRequired)}
                          capture={selectedProofRequired === 'photo' || selectedProofRequired === 'video' ? 'environment' : undefined}
                          multiple
                          className="hidden"
                          onChange={handleFileChange}
                        />

                        {previewFiles.length > 0 && (
                          <SubmissionFilesGrid files={previewFiles} emptyLabel="ยังไม่มีไฟล์หลักฐาน" onRemove={removeUpload} />
                        )}

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full flex flex-col items-center justify-center gap-3 py-8 border-2 border-dashed border-slate-200 rounded-[2rem] hover:border-emerald-300 hover:bg-emerald-50/40 transition-all"
                        >
                          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-full">
                            {selectedProofRequired === 'video' ? <Video className="w-6 h-6" /> : <ImagePlus className="w-6 h-6" />}
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-black text-slate-900">แนบหลักฐาน</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">รูปภาพหรือวิดีโอตามที่งานกำหนด</p>
                          </div>
                        </button>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">หมายเหตุ</label>
                      <TextArea
                        id="milestone-proof-note"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={3}
                        placeholder="ระบุรายละเอียดการทำงานหรือสิ่งที่ต้องการแจ้งผู้จัดการ..."
                        className="rounded-2xl border-slate-100 focus:ring-emerald-100"
                      />
                    </div>

                    <Button
                      fullWidth
                      size="lg"
                      variant="none"
                      className={`h-14 rounded-2xl text-sm font-black gap-2 shadow-lg ${
                        canSubmit
                          ? 'bg-emerald-600 text-white shadow-emerald-200 hover:bg-emerald-700'
                          : 'bg-slate-100 text-slate-400 shadow-none cursor-not-allowed'
                      }`}
                      loading={submitting}
                      disabled={!canSubmit}
                      onClick={handleSubmit}
                      icon={<Send className="w-4 h-4" />}
                    >
                      ส่งงานและรับ Milestone
                    </Button>

                    {submitError && (
                      <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-red-500">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {submitError}
                      </div>
                    )}
                  </div>
                  )
                ) : (
                  <div className="rounded-[2rem] bg-emerald-50 border border-emerald-100 p-5 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
                    <p className="text-sm font-black text-emerald-900">Milestone นี้สำเร็จแล้ว</p>
                    <p className="text-xs font-bold text-emerald-700 mt-1">ยอดสะสมเพิ่มแล้ว {formatThaiCurrency(selectedReward)}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
