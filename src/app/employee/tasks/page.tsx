'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Coins,
  ImagePlus,
  Send,
  Trophy,
  Video,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { TextArea } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { Page, PageHeader, StatTile } from '@/components/ui/Page';
import SubmissionFilesGrid, { type PreviewFile } from '@/components/ui/SubmissionFilesGrid';
import Tabs from '@/components/ui/Tabs';
import { PROOF_TYPE_LABELS, TASK_STATUS_LABELS } from '@/lib/constants';
import { formatThaiDate } from '@/lib/dateUtils';
import {
  buildReviewRequestNotifications,
  getReviewRecipients,
  insertNotifications,
} from '@/lib/reviewHelpers';
import {
  formatThaiCurrency,
  getMilestoneReward,
  isAttendanceTask,
  isMilestoneComplete,
  sortMilestoneTasks,
} from '@/lib/taskMilestones';
import type { FileType, ProofType, Task } from '@/lib/types';
import { useAuthStore } from '@/store/authStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useTaskStore } from '@/store/taskStore';

type TaskView = 'today' | 'active' | 'review' | 'fix' | 'done';

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

function getTaskBadgeVariant(status: Task['status']) {
  if (status === 'approved') return 'success' as const;
  if (status === 'submitted') return 'warning' as const;
  if (status === 'rejected' || status === 'overdue') return 'danger' as const;
  return 'default' as const;
}

export default function MyTasksPage() {
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.currentUser);
  const taskStore = useTaskStore();
  const employeeStore = useEmployeeStore();
  const [activeView, setActiveView] = useState<TaskView>('today');
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
    return sortMilestoneTasks(
      taskStore.getTasksByUser(currentUser.id),
      (task) => task.template_id ? taskStore.getTemplateById(task.template_id) : null,
    );
  }, [currentUser, taskStore]);

  const todayTasks = useMemo(() => {
    if (!currentUser) return [];
    return sortMilestoneTasks(
      taskStore.getTodayTasksByUser(currentUser.id),
      (task) => task.template_id ? taskStore.getTemplateById(task.template_id) : null,
    );
  }, [currentUser, taskStore]);

  const completedTasks = allTasks.filter((task) => isMilestoneComplete(task.status));
  const earnedReward = allTasks.reduce((sum, task) => {
    const template = task.template_id ? taskStore.getTemplateById(task.template_id) : null;
    return sum + (isMilestoneComplete(task.status) ? getMilestoneReward(task, template) : 0);
  }, 0);
  const totalReward = allTasks.reduce((sum, task) => {
    const template = task.template_id ? taskStore.getTemplateById(task.template_id) : null;
    return sum + getMilestoneReward(task, template);
  }, 0);
  const progress = allTasks.length > 0 ? Math.round((completedTasks.length / allTasks.length) * 100) : 100;

  const taskTabs = [
    { id: 'today', label: 'วันนี้', count: todayTasks.length },
    { id: 'active', label: 'ต้องทำ', count: allTasks.filter((task) => ['pending', 'in_progress', 'overdue'].includes(task.status)).length },
    { id: 'review', label: 'รอตรวจ', count: allTasks.filter((task) => task.status === 'submitted').length },
    { id: 'fix', label: 'แก้งาน', count: allTasks.filter((task) => task.status === 'rejected').length },
    { id: 'done', label: 'เสร็จแล้ว', count: allTasks.filter((task) => isMilestoneComplete(task.status)).length },
  ];

  const visibleTasks = useMemo(() => {
    switch (activeView) {
      case 'today':
        return todayTasks;
      case 'active':
        return allTasks.filter((task) => ['pending', 'in_progress', 'overdue'].includes(task.status));
      case 'review':
        return allTasks.filter((task) => task.status === 'submitted');
      case 'fix':
        return allTasks.filter((task) => task.status === 'rejected');
      case 'done':
        return allTasks.filter((task) => isMilestoneComplete(task.status));
      default:
        return allTasks;
    }
  }, [activeView, allTasks, todayTasks]);

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

  const handleTaskAction = (task: Task) => {
    const template = task.template_id ? taskStore.getTemplateById(task.template_id) : null;

    if (!isMilestoneComplete(task.status) && isAttendanceTask(task, template)) {
      router.push('/employee/check-in');
      return;
    }

    openMilestone(task);
  };

  return (
    <Page maxWidth="sm" className="space-y-5 pb-24">
      <PageHeader
        title="งานของฉัน"
        description="ติดตามงานวันนี้ งานที่ต้องแก้ และรายได้จาก Milestone"
      />

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="เงินสะสม"
          value={formatThaiCurrency(earnedReward)}
          helper={`เป้าหมาย ${formatThaiCurrency(totalReward)}`}
          icon={<Coins className="h-5 w-5" />}
          tone="green"
        />
        <StatTile
          label="ทำสำเร็จ"
          value={`${completedTasks.length}/${allTasks.length}`}
          helper={`${progress}% progress`}
          icon={<Trophy className="h-5 w-5" />}
          tone="blue"
        />
      </div>

      <Tabs
        variant="pill"
        tabs={taskTabs}
        activeTab={activeView}
        onChange={(tab) => setActiveView(tab as TaskView)}
      />

      {visibleTasks.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-500">ยังไม่มีงานในหมวดนี้</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleTasks.map((task) => {
            const template = task.template_id ? taskStore.getTemplateById(task.template_id) : null;
            const reward = getMilestoneReward(task, template);
            const actionLabel = task.status === 'approved'
              ? 'ดูรายละเอียด'
              : isAttendanceTask(task, template)
                ? 'ไปเช็คอิน'
                : task.status === 'submitted'
                  ? 'ดูสถานะ'
                  : 'ส่งงาน';

            return (
              <Card key={task.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-slate-950">
                      {task.title || template?.title || 'งาน'}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                      {task.description || template?.description || 'ไม่มีรายละเอียดเพิ่มเติม'}
                    </p>
                  </div>
                  <Badge variant={getTaskBadgeVariant(task.status)}>
                    {TASK_STATUS_LABELS[task.status]}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{formatThaiDate(task.due_date || task.created_at)}</span>
                  <span>{formatThaiCurrency(reward)}</span>
                </div>
                <Button
                  className="mt-4"
                  fullWidth
                  variant={task.status === 'approved' || task.status === 'submitted' ? 'secondary' : 'primary'}
                  onClick={() => handleTaskAction(task)}
                >
                  {actionLabel}
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={Boolean(selectedTask)} onClose={closeMilestone} title="ส่งงาน" bottomSheet>
        {selectedTask && (
          <div className="space-y-4">
            {submitSuccess ? (
              <div className="py-6 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
                <h2 className="mt-3 text-lg font-semibold text-slate-950">ส่งงานเรียบร้อยแล้ว</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedTemplate?.requires_approval ? 'รอผู้จัดการตรวจสอบ' : `เพิ่มยอดสะสม ${formatThaiCurrency(selectedReward)}`}
                </p>
                <Button className="mt-5" fullWidth onClick={closeMilestone}>กลับไปดูงาน</Button>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">{selectedTask.title || selectedTemplate?.title || 'งาน'}</p>
                      <p className="mt-1 text-xs text-slate-500">{PROOF_TYPE_LABELS[selectedProofRequired]}</p>
                    </div>
                    <Badge variant={getTaskBadgeVariant(selectedTask.status)}>{TASK_STATUS_LABELS[selectedTask.status]}</Badge>
                  </div>
                </div>

                {selectedTask.checklist_state && selectedTask.checklist_state.length > 0 && (
                  <div className="space-y-2">
                    {selectedTask.checklist_state.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={isMilestoneComplete(selectedTask.status)}
                        onClick={() => handleChecklistToggle(item.id)}
                        className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left disabled:opacity-70"
                      >
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${
                          item.completed ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'
                        }`}>
                          {item.completed && <CheckSquare className="h-4 w-4" />}
                        </span>
                        <span className={`text-sm font-medium ${item.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                          {item.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

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
                    <SubmissionFilesGrid
                      files={previewFiles}
                      emptyLabel="ยังไม่มีไฟล์หลักฐาน"
                      onRemove={(id) => setProofUploads((current) => {
                        const target = current.find((upload) => upload.id === id);
                        if (target) URL.revokeObjectURL(target.previewUrl);
                        return current.filter((upload) => upload.id !== id);
                      })}
                    />
                    <Button
                      fullWidth
                      variant="outline"
                      icon={selectedProofRequired === 'video' ? <Video className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      แนบหลักฐาน
                    </Button>
                  </div>
                )}

                <TextArea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  label="บันทึกเพิ่มเติม"
                  rows={3}
                  placeholder="ระบุรายละเอียดเพิ่มเติม"
                />

                <Button fullWidth loading={submitting} disabled={!canSubmit} onClick={() => void handleSubmit()} icon={<Send className="h-4 w-4" />}>
                  ส่งงานให้ตรวจ
                </Button>

                {submitError && (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    {submitError}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </Page>
  );
}
