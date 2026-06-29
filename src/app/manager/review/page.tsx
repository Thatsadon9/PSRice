'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  CheckSquare,
  FileText,
  MessageSquare,
  Star,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import { Page, PageHeader } from '@/components/ui/Page';
import SubmissionFilesGrid from '@/components/ui/SubmissionFilesGrid';
import StarRating from '@/components/ui/StarRating';
import Tabs from '@/components/ui/Tabs';
import { TextArea } from '@/components/ui/Input';
import { formatThaiDateTime } from '@/lib/dateUtils';
import { parseReviewFeedback } from '@/lib/reviewFeedback';
import type { ReviewStatus, TaskStatus, TaskSubmission } from '@/lib/types';
import {
  buildReviewResultNotification,
  getPendingReviewSubmissionsForUser,
  getReviewedSubmissionsForUser,
  insertNotifications,
} from '@/lib/reviewHelpers';
import { useAuthStore } from '@/store/authStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useTaskStore } from '@/store/taskStore';

type ReviewTab = 'pending' | 'reviewed';

export default function ManagerReviewPage() {
  const taskStore = useTaskStore();
  const employeeStore = useEmployeeStore();
  const currentUser = useAuthStore((state) => state.currentUser);

  const [activeTab, setActiveTab] = useState<ReviewTab>('pending');
  const [selectedSubmission, setSelectedSubmission] = useState<TaskSubmission | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewRating, setReviewRating] = useState<number | null>(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  const activeEmployees = employeeStore.users.filter((user) => user.status !== 'inactive');
  const pendingSubmissions = getPendingReviewSubmissionsForUser(taskStore.submissions, currentUser, activeEmployees);
  const reviewedSubmissions = getReviewedSubmissionsForUser(taskStore.submissions, currentUser, activeEmployees);
  const visibleSubmissions = activeTab === 'pending' ? pendingSubmissions : reviewedSubmissions;

  const getSubmissionDetails = (submission: TaskSubmission | null) => {
    if (!submission) return null;

    const employee = employeeStore.getUserById(submission.submitted_by);
    const task = taskStore.getTaskById(submission.task_id);
    const template = task?.template_id ? taskStore.getTemplateById(task.template_id) : null;
    const files = taskStore.getFilesBySubmission(submission.id);
    const reviewer = submission.reviewed_by ? employeeStore.getUserById(submission.reviewed_by) : null;
    const feedback = parseReviewFeedback(submission.review_comment, submission.review_rating);

    return { submission, employee, task, template, files, reviewer, feedback };
  };

  const openSubmission = (submission: TaskSubmission) => {
    const feedback = parseReviewFeedback(submission.review_comment, submission.review_rating);
    setSelectedSubmission(submission);
    setReviewComment(feedback.comment);
    setReviewRating(feedback.rating ?? (submission.review_status === 'pending' ? 0 : null));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedSubmission(null);
    setReviewComment('');
    setReviewRating(0);
  };

  const handleReview = async (status: ReviewStatus) => {
    if (!selectedSubmission || !currentUser) return;

    setProcessing(true);

    await taskStore.reviewSubmission(
      selectedSubmission.id,
      status,
      reviewComment,
      currentUser.id,
      reviewRating,
    );

    const nextTaskStatus: TaskStatus = status === 'approved' ? 'approved' : 'rejected';
    await taskStore.updateTaskStatus(selectedSubmission.task_id, nextTaskStatus);

    const detail = getSubmissionDetails(selectedSubmission);
    await insertNotifications([
      buildReviewResultNotification({
        taskId: selectedSubmission.task_id,
        taskTitle: detail?.task?.title || detail?.template?.title || 'งาน',
        reviewerName: currentUser.full_name,
        reviewStatus: status,
        reviewRating,
        reviewComment,
        recipientId: selectedSubmission.submitted_by,
      }),
    ]);

    setProcessing(false);
    closeModal();
  };

  const detail = getSubmissionDetails(selectedSubmission);

  return (
    <Page maxWidth="xl" className="space-y-6">
      <PageHeader
        title="ตรวจงาน"
        description="งานที่ส่งเข้ามาเพื่อรออนุมัติและประวัติการตรวจล่าสุด"
      />

      <Tabs
        variant="pill"
        activeTab={activeTab}
        onChange={(tab) => setActiveTab(tab as ReviewTab)}
        tabs={[
          { id: 'pending', label: 'รอดำเนินการ', count: pendingSubmissions.length },
          { id: 'reviewed', label: 'ตรวจแล้ว', count: reviewedSubmissions.length },
        ]}
      />

      {visibleSubmissions.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">
            {activeTab === 'pending' ? 'ไม่มีงานค้างรอตรวจ' : 'ยังไม่มีประวัติการตรวจ'}
          </h3>
          <p className="mt-2 max-w-xs text-sm text-slate-500">
            {activeTab === 'pending'
              ? 'ไม่มีงานที่กำลังรอ Manager/Admin อนุมัติในตอนนี้'
              : 'เมื่อมีการอนุมัติหรือปฏิเสธงาน รายการจะปรากฏที่นี่'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleSubmissions.map((submission) => {
            const item = getSubmissionDetails(submission);
            const isPending = submission.review_status === 'pending';

            return (
              <button
                key={submission.id}
                type="button"
                onClick={() => openSubmission(submission)}
                className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-primary-200 hover:bg-primary-50/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {item?.task?.title || item?.template?.title || 'งานที่ส่งตรวจ'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{item?.employee?.full_name || 'ไม่ระบุพนักงาน'}</p>
                  </div>
                  <Badge variant={isPending ? 'warning' : submission.review_status === 'approved' ? 'success' : 'danger'}>
                    {isPending ? 'รอตรวจ' : submission.review_status === 'approved' ? 'อนุมัติแล้ว' : 'ไม่ผ่าน'}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{formatThaiDateTime(isPending ? submission.submitted_at : submission.reviewed_at || submission.submitted_at)}</span>
                  {item?.feedback.rating != null && <StarRating value={item.feedback.rating} readOnly size="sm" />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={closeModal} title="รายละเอียดงานที่ส่งตรวจ">
        {detail && (
          <div className="space-y-5">
            <div className="flex items-start gap-4 rounded-xl bg-primary-50 p-3">
              <div className="rounded-lg bg-white p-2 text-primary-600 shadow-sm">
                <CheckSquare className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-bold leading-tight text-slate-900">{detail.task?.title || detail.template?.title || 'งาน'}</h4>
                <p className="mt-1 text-xs text-slate-500">ผู้ปฏิบัติงาน: {detail.employee?.full_name || 'ไม่ทราบชื่อ'}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <FileText className="h-3.5 w-3.5" /> หลักฐานงาน
                </label>
                <SubmissionFilesGrid
                  files={detail.files.map((file) => ({
                    id: file.id,
                    file_url: file.file_url,
                    file_type: file.file_type,
                  }))}
                  allowDownload
                />
              </div>

              {detail.task?.checklist_state && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                    <CheckCircle2 className="h-3.5 w-3.5" /> รายการตรวจสอบ
                  </label>
                  <div className="space-y-1">
                    {detail.task.checklist_state.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 rounded bg-slate-50 p-2 text-sm text-slate-700">
                        {item.completed ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <div className="h-4 w-4 rounded-full border border-slate-300" />}
                        <span className={item.completed ? '' : 'text-slate-400'}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <MessageSquare className="h-3.5 w-3.5" /> หมายเหตุจากพนักงาน
                </label>
                <div className="rounded-lg border-l-4 border-slate-300 bg-slate-50 p-3 text-sm italic text-slate-700">
                  {detail.submission.note || '(ไม่มีหมายเหตุ)'}
                </div>
              </div>

              {(detail.submission.review_status === 'pending' || detail.feedback.rating != null) && (
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                    <Star className="h-3.5 w-3.5" /> คะแนนผลงาน
                  </label>
                  <StarRating
                    value={reviewRating}
                    onChange={setReviewRating}
                    disabled={detail.submission.review_status !== 'pending'}
                  />
                </div>
              )}

              <div className="border-t border-slate-100 pt-4">
                <TextArea
                  label="ความคิดเห็นของผู้ตรวจ"
                  placeholder="ระบุข้อสังเกตหรือคำแนะนำเพิ่มเติม"
                  value={reviewComment}
                  onChange={(event) => setReviewComment(event.target.value)}
                  rows={3}
                  disabled={detail.submission.review_status !== 'pending'}
                />
              </div>

              {detail.submission.review_status !== 'pending' && (
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                  ตรวจโดย {detail.reviewer?.full_name || 'ผู้จัดการ'} เมื่อ{' '}
                  {formatThaiDateTime(detail.submission.reviewed_at || detail.submission.submitted_at)}
                </div>
              )}
            </div>

            {detail.submission.review_status === 'pending' ? (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="danger" loading={processing} onClick={() => void handleReview('rejected')}>
                  ไม่อนุมัติ
                </Button>
                <Button loading={processing} onClick={() => void handleReview('approved')}>
                  อนุมัติ
                </Button>
              </div>
            ) : (
              <Button variant="secondary" fullWidth onClick={closeModal}>
                ปิด
              </Button>
            )}
          </div>
        )}
      </Modal>
    </Page>
  );
}
