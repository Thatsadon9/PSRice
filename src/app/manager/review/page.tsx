'use client';
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
import {
  CheckCircle2,
  CheckSquare,
  Clock,
  FileText,
  MessageSquare,
  Star,
  XCircle,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import SubmissionFilesGrid from '@/components/ui/SubmissionFilesGrid';
import StarRating from '@/components/ui/StarRating';
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

  const pendingSubmissions = getPendingReviewSubmissionsForUser(
    taskStore.submissions,
    currentUser,
    employeeStore.users,
  );
  const reviewedSubmissions = getReviewedSubmissionsForUser(
    taskStore.submissions,
    currentUser,
    employeeStore.users,
  );
  const visibleSubmissions = activeTab === 'pending' ? pendingSubmissions : reviewedSubmissions;

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
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ตรวจงาน</h1>
          <p className="text-slate-500 text-sm mt-1">
            งานที่ส่งเข้ามาเพื่อรออนุมัติและประวัติการตรวจล่าสุด
          </p>
        </div>

        <div className="flex gap-2 bg-slate-100 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 text-xs font-bold rounded ${activeTab === 'pending' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            รอดำเนินการ ({pendingSubmissions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reviewed')}
            className={`px-3 py-1.5 text-xs font-bold rounded ${activeTab === 'reviewed' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            ตรวจแล้ว ({reviewedSubmissions.length})
          </button>
        </div>
      </div>

      {visibleSubmissions.length === 0 ? (
        <Card className="py-16 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">
            {activeTab === 'pending' ? 'ไม่มีงานค้างรอตรวจ' : 'ยังไม่มีประวัติการตรวจ'}
          </h3>
          <p className="text-sm text-slate-500 mt-2 max-w-xs">
            {activeTab === 'pending'
              ? 'ไม่มีงานที่กำลังรอ Manager/Admin อนุมัติในตอนนี้'
              : 'เมื่อมีการอนุมัติหรือปฏิเสธงาน รายการจะปรากฏที่นี่'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {visibleSubmissions.map((submission) => {
            const employee = employeeStore.getUserById(submission.submitted_by);
            const task = taskStore.getTaskById(submission.task_id);
            const template = task?.template_id ? taskStore.getTemplateById(task.template_id) : null;
            const isPending = submission.review_status === 'pending';
            const feedback = parseReviewFeedback(submission.review_comment, submission.review_rating);

            return (
              <Card key={submission.id} className="flex flex-col relative card-hover" padding="none">
                <div className="p-4 flex-1 space-y-3">
                  <div className="flex justify-between items-start gap-3">
                    <Badge
                      variant={isPending ? 'warning' : submission.review_status === 'approved' ? 'success' : 'danger'}
                      dot
                    >
                      {isPending ? 'รอตรวจ' : submission.review_status === 'approved' ? 'อนุมัติแล้ว' : 'ไม่ผ่าน'}
                    </Badge>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 text-right">
                      <Clock className="w-3 h-3" />
                      {formatThaiDateTime(isPending ? submission.submitted_at : submission.reviewed_at || submission.submitted_at)}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900">{task?.title || template?.title || 'งาน'}</h3>

                  <div className="flex items-center gap-2">
                    {employee?.avatar_url ? (
                      <img src={employee.avatar_url} alt={employee.full_name} className="w-6 h-6 rounded-full object-cover border border-slate-100 shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold shrink-0">
                        {employee?.full_name.charAt(0) || 'U'}
                      </div>
                    )}
                    <span className="text-xs text-slate-600 font-medium">{employee?.full_name || 'ไม่ทราบชื่อ'}</span>
                  </div>

                  {submission.note && (
                    <div className="p-2 bg-slate-50 rounded text-xs text-slate-500 italic line-clamp-2">
                      {submission.note}
                    </div>
                  )}

                  {!isPending && (
                    <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                      {feedback.rating != null && (
                        <StarRating value={feedback.rating} readOnly size="sm" />
                      )}
                      {feedback.comment && (
                        <div className="text-xs text-slate-600 line-clamp-3">{feedback.comment}</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="p-3 bg-slate-50/80 border-t border-slate-100 flex gap-2">
                  <Button variant="secondary" size="sm" fullWidth onClick={() => openSubmission(submission)}>
                    ดูรายละเอียด
                  </Button>
                  {isPending && (
                    <Button variant="primary" size="sm" fullWidth onClick={() => openSubmission(submission)}>
                      ตรวจงาน
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={closeModal} title="รายละเอียดงานที่ส่งตรวจ">
        {detail && (
          <div className="space-y-5">
            <div className="flex items-start gap-4 p-3 bg-primary-50 rounded-xl">
              <div className="p-2 bg-white rounded-lg text-primary-600 shadow-sm">
                <CheckSquare className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 leading-tight">{detail.task?.title || detail.template?.title || 'งาน'}</h4>
                <p className="text-xs text-slate-500 mt-1">ผู้ปฏิบัติงาน: {detail.employee?.full_name || 'ไม่ทราบชื่อ'}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-2 uppercase tracking-wider">
                  <FileText className="w-3.5 h-3.5" /> หลักฐานงาน
                </label>
                <SubmissionFilesGrid
                  files={detail.files.map((file) => ({
                    id: file.id,
                    file_url: file.file_url,
                    file_type: file.file_type,
                  }))}
                />
              </div>

              {detail.task?.checklist_state && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 flex items-center gap-2 uppercase tracking-wider">
                    <CheckCircle2 className="w-3.5 h-3.5" /> รายการตรวจสอบ
                  </label>
                  <div className="space-y-1">
                    {detail.task.checklist_state.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 p-2 rounded">
                        {item.completed ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <div className="w-4 h-4 rounded-full border border-slate-300" />}
                        <span className={item.completed ? '' : 'text-slate-400'}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-2 uppercase tracking-wider">
                  <MessageSquare className="w-3.5 h-3.5" /> หมายเหตุจากพนักงาน
                </label>
                <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-700 italic border-l-4 border-slate-300">
                  {detail.submission.note || '(ไม่มีหมายเหตุ)'}
                </div>
              </div>

              {(detail.submission.review_status === 'pending' || detail.feedback.rating != null) && (
                <div className="space-y-2 pt-4 border-t border-slate-100">
                  <label className="text-xs font-bold text-slate-500 flex items-center gap-2 uppercase tracking-wider">
                    <Star className="w-3.5 h-3.5" /> คะแนนผลงาน
                  </label>
                  <StarRating
                    value={reviewRating}
                    onChange={setReviewRating}
                    disabled={detail.submission.review_status !== 'pending'}
                  />
                </div>
              )}

              <div className="pt-4 border-t border-slate-100">
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
              <div className="flex gap-3 pt-2">
                <Button
                  variant="danger"
                  fullWidth
                  loading={processing}
                  onClick={() => void handleReview('rejected')}
                  icon={<XCircle className="w-4 h-4" />}
                >
                  ไม่อนุมัติ
                </Button>
                <Button
                  variant="success"
                  fullWidth
                  loading={processing}
                  onClick={() => void handleReview('approved')}
                  icon={<CheckCircle2 className="w-4 h-4" />}
                >
                  อนุมัติงาน
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
    </div>
  );
}
