'use client';

import { use, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  CheckSquare,
  Clock,
  FileText,
  MessageSquare,
  Star,
  User,
  XCircle,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import SubmissionFilesGrid from '@/components/ui/SubmissionFilesGrid';
import StarRating from '@/components/ui/StarRating';
import { TextArea } from '@/components/ui/Input';
import { formatThaiDateTime } from '@/lib/dateUtils';
import { parseReviewFeedback } from '@/lib/reviewFeedback';
import type { ReviewStatus, TaskStatus } from '@/lib/types';
import {
  buildReviewResultNotification,
  canReviewSubmission,
  insertNotifications,
} from '@/lib/reviewHelpers';
import { useAuthStore } from '@/store/authStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useTaskStore } from '@/store/taskStore';

export default function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const taskStore = useTaskStore();
  const employeeStore = useEmployeeStore();
  const currentUser = useAuthStore((state) => state.currentUser);

  const submission = taskStore.submissions.find((item) => item.id === id);
  const initialFeedback = useMemo(
    () => parseReviewFeedback(submission?.review_comment, submission?.review_rating),
    [submission?.review_comment, submission?.review_rating],
  );
  const [reviewComment, setReviewComment] = useState(initialFeedback.comment);
  const [reviewRating, setReviewRating] = useState<number | null>(
    initialFeedback.rating ?? (submission?.review_status === 'pending' ? 0 : null),
  );
  const [processing, setProcessing] = useState(false);

  if (!submission) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-xl font-bold text-slate-800">ไม่พบข้อมูลการส่งงาน</h2>
        <Button className="mt-4" onClick={() => router.push('/manager/review')}>
          กลับไปหน้าตรวจงาน
        </Button>
      </div>
    );
  }

  const canReview = canReviewSubmission(currentUser, submission, employeeStore.users);
  const employee = employeeStore.getUserById(submission.submitted_by);
  const task = taskStore.getTaskById(submission.task_id);
  const template = task?.template_id ? taskStore.getTemplateById(task.template_id) : null;
  const files = taskStore.getFilesBySubmission(submission.id);
  const reviewer = submission.reviewed_by ? employeeStore.getUserById(submission.reviewed_by) : null;

  const handleReview = async (status: ReviewStatus) => {
    if (!currentUser || !canReview) return;

    setProcessing(true);

    await taskStore.reviewSubmission(
      submission.id,
      status,
      reviewComment,
      currentUser.id,
      reviewRating,
    );

    const nextTaskStatus: TaskStatus = status === 'approved' ? 'approved' : 'rejected';
    await taskStore.updateTaskStatus(submission.task_id, nextTaskStatus);

    await insertNotifications([
      buildReviewResultNotification({
        taskId: submission.task_id,
        taskTitle: task?.title || template?.title || 'งาน',
        reviewerName: currentUser.full_name,
        reviewStatus: status,
        reviewRating,
        reviewComment,
        recipientId: submission.submitted_by,
      }),
    ]);

    setProcessing(false);
    router.push('/manager/review');
  };

  if (!canReview) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-xl font-bold text-slate-800">ไม่มีสิทธิ์ตรวจงานรายการนี้</h2>
        <p className="mt-2 text-sm text-slate-500">งานนี้ไม่อยู่ในขอบเขตการอนุมัติของบัญชีปัจจุบัน</p>
        <Button className="mt-4" onClick={() => router.push('/manager/review')}>
          กลับไปหน้าตรวจงาน
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in pb-10">
      <button
        type="button"
        onClick={() => router.push('/manager/review')}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        ย้อนกลับ
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ตรวจงานพนักงาน</h1>
          <p className="text-slate-500 text-sm mt-1">ตรวจสอบหลักฐานและอนุมัติผลการทำงาน</p>
        </div>
        <Badge variant={submission.review_status === 'pending' ? 'warning' : submission.review_status === 'approved' ? 'success' : 'danger'}>
          {submission.review_status === 'pending' ? 'รอตรวจ' : submission.review_status === 'approved' ? 'อนุมัติแล้ว' : 'ไม่ผ่าน'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card padding="lg" className="space-y-6">
            <div className="flex items-start gap-4 p-4 bg-primary-50 rounded-2xl border border-primary-100">
              <div className="p-3 bg-white rounded-xl text-primary-600 shadow-sm">
                <CheckSquare className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-900 leading-tight">{task?.title || template?.title || 'งาน'}</h4>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 font-medium">
                  <span className="flex items-center gap-1"><User className="w-3 h-3 text-slate-400" /> {employee?.full_name || 'ไม่ทราบชื่อ'}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-slate-400" /> {formatThaiDateTime(submission.submitted_at)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary-600" /> หลักฐานงาน ({files.length})
              </label>
              <SubmissionFilesGrid
                files={files.map((file) => ({
                  id: file.id,
                  file_url: file.file_url,
                  file_type: file.file_type,
                }))}
              />
            </div>

            {task?.checklist_state && (
              <div className="space-y-3 pt-6 border-t border-slate-100">
                <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-emerald-600" /> รายการตรวจสอบที่ส่งมา
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {task.checklist_state.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3 bg-slate-50/80 rounded-xl">
                      {item.completed ? (
                        <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-slate-200" />
                      )}
                      <span className={item.completed ? 'text-slate-900' : 'text-slate-400'}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 pt-6 border-t border-slate-100">
              <label className="text-sm font-bold text-slate-900 flex items-center gap-2 font-mono uppercase tracking-wider opacity-60">
                <MessageSquare className="w-3.5 h-3.5" /> หมายเหตุจากพนักงาน
              </label>
              <div className="p-4 bg-slate-50 rounded-2xl text-sm text-slate-700 italic border-l-4 border-slate-300">
                {submission.note || '(ไม่มีหมายเหตุ)'}
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="sticky top-6">
            <h3 className="font-bold text-slate-900 mb-4">สถานะการตรวจสอบ</h3>

            <div className="space-y-4">
              {(submission.review_status === 'pending' || initialFeedback.rating != null) && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500" /> คะแนนผลงาน
                  </label>
                  <StarRating
                    value={reviewRating}
                    onChange={setReviewRating}
                    disabled={submission.review_status !== 'pending'}
                  />
                </div>
              )}

              <TextArea
                label="ผลการตรวจสอบ / ข้อเสนอแนะ"
                placeholder="ระบุข้อสังเกตหรือข้อแนะนำเพิ่มเติม"
                rows={4}
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                className="bg-slate-50 focus:bg-white"
                disabled={submission.review_status !== 'pending'}
              />

              {submission.review_status === 'pending' ? (
                <div className="space-y-2">
                  <Button
                    variant="success"
                    fullWidth
                    loading={processing}
                    onClick={() => void handleReview('approved')}
                    icon={<CheckCircle2 className="w-4 h-4" />}
                  >
                    อนุมัติผลงาน
                  </Button>
                  <Button
                    variant="danger"
                    fullWidth
                    loading={processing}
                    onClick={() => void handleReview('rejected')}
                    icon={<XCircle className="w-4 h-4" />}
                  >
                    ไม่ผ่าน / ให้แก้ไขใหม่
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 space-y-2">
                  {reviewRating != null && (
                    <StarRating value={reviewRating} readOnly size="sm" />
                  )}
                  <div>
                    ตรวจโดย {reviewer?.full_name || 'ผู้จัดการ'} เมื่อ {formatThaiDateTime(submission.reviewed_at || submission.submitted_at)}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100">
              <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                เมื่ออนุมัติหรือปฏิเสธงานแล้ว ระบบจะอัปเดตสถานะงาน ส่งคะแนน และส่งการแจ้งเตือนไปยังพนักงานทันที
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
