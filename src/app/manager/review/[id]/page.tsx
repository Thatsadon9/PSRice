'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CheckSquare,
  Clock,
  FileText,
  MessageSquare,
  Minus,
  Plus,
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
import {
  calculateUnitReward,
  formatThaiCurrency,
  formatUnitQuantity,
  getSubmittedQuantity,
  getUnitLabel,
  getUnitMax,
  getUnitMin,
  getUnitRate,
  getUnitStep,
  isUnitRewardTask,
  validateUnitQuantity,
} from '@/lib/taskMilestones';
import type { ReviewStatus, TaskStatus } from '@/lib/types';
import {
  buildReviewResultNotification,
  canReviewSubmission,
  insertNotifications,
} from '@/lib/reviewHelpers';
import { useAuthStore } from '@/store/authStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useTaskStore } from '@/store/taskStore';

function getReviewActionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    if (error.message.includes('approved_quantity exceeds the task maximum')) {
      return 'จำนวนที่อนุมัติเกินจำนวนสูงสุดที่กำหนดไว้';
    }

    if (error.message.includes('approved_quantity is below the task minimum')) {
      return 'จำนวนที่อนุมัติต่ำกว่าจำนวนขั้นต่ำที่กำหนดไว้';
    }

    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return getReviewActionErrorMessage(new Error(message));
    }
  }

  return 'ตรวจงานไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง';
}

function normalizeWholeQuantityInput(value: string) {
  const [wholePart = ''] = value.replace(/[^\d.]/g, '').split('.');
  return wholePart.replace(/^0+(?=\d)/, '');
}

export default function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const taskStore = useTaskStore();
  const fetchInitialData = useTaskStore((state) => state.fetchInitialData);
  const employeeStore = useEmployeeStore();
  const currentUser = useAuthStore((state) => state.currentUser);

  const submission = taskStore.submissions.find((item) => item.id === id);
  const initialFeedback = useMemo(
    () => parseReviewFeedback(submission?.review_comment, submission?.review_rating),
    [submission?.review_comment, submission?.review_rating],
  );
  const initialApprovedQuantityInput = submission?.approved_quantity != null
    ? normalizeWholeQuantityInput(String(submission.approved_quantity))
    : submission?.submitted_quantity != null
      ? normalizeWholeQuantityInput(String(submission.submitted_quantity))
      : '';
  const [reviewCommentDraft, setReviewCommentDraft] = useState<{ submissionId: string; value: string } | null>(null);
  const [reviewRatingDraft, setReviewRatingDraft] = useState<{ submissionId: string; value: number | null } | null>(null);
  const [approvedQuantityDraft, setApprovedQuantityDraft] = useState<{ submissionId: string; value: string } | null>(null);
  const [quantityOverrideConfirmed, setQuantityOverrideConfirmed] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [isResolvingSubmission, setIsResolvingSubmission] = useState(false);
  const [resolvedSubmissionId, setResolvedSubmissionId] = useState<string | null>(null);
  const hasResolvedSubmission = resolvedSubmissionId === id;
  const reviewComment = submission && reviewCommentDraft?.submissionId === submission.id
    ? reviewCommentDraft.value
    : initialFeedback.comment;
  const reviewRating = submission && reviewRatingDraft?.submissionId === submission.id
    ? reviewRatingDraft.value
    : initialFeedback.rating ?? (submission?.review_status === 'pending' ? 0 : null);
  const approvedQuantityInput = submission && approvedQuantityDraft?.submissionId === submission.id
    ? approvedQuantityDraft.value
    : initialApprovedQuantityInput;

  useEffect(() => {
    setQuantityOverrideConfirmed(false);
  }, [approvedQuantityInput, submission?.id]);

  useEffect(() => {
    if (submission || hasResolvedSubmission) {
      return;
    }

    let isActive = true;

    const resolveSubmission = async () => {
      setIsResolvingSubmission(true);
      await fetchInitialData();

      if (isActive) {
        setResolvedSubmissionId(id);
        setIsResolvingSubmission(false);
      }
    };

    void resolveSubmission();

    return () => {
      isActive = false;
    };
  }, [fetchInitialData, hasResolvedSubmission, id, submission]);

  if (!submission && (isResolvingSubmission || !hasResolvedSubmission)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-100 border-t-primary-600" />
        <h2 className="mt-5 text-xl font-bold text-slate-800">กำลังโหลดข้อมูลงานที่ส่ง</h2>
        <p className="mt-2 text-sm text-slate-500">กำลังตรวจสอบรายการส่งงานล่าสุดจากฐานข้อมูล</p>
      </div>
    );
  }

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
  const isUnitReward = Boolean(task && isUnitRewardTask(task, template));
  const unitLabel = task ? getUnitLabel(task, template) : 'หน่วย';
  const unitRate = task ? getUnitRate(task, template) : 0;
  const unitMin = task ? getUnitMin(task, template) : null;
  const unitMax = task ? getUnitMax(task, template) : null;
  const unitStep = task ? getUnitStep(task, template) : 1;
  const submittedQuantity = getSubmittedQuantity(task, submission);
  const approvedQuantity = approvedQuantityInput.trim() ? Number(approvedQuantityInput) : NaN;
  const approvedQuantityValidation = validateUnitQuantity(approvedQuantity, task, template);
  const approvedRewardAmount = isUnitReward && Number.isFinite(approvedQuantity)
    ? calculateUnitReward(approvedQuantity, unitRate)
    : null;
  const approvedQuantityDiff = submittedQuantity !== null && Number.isFinite(approvedQuantity)
    ? approvedQuantity - submittedQuantity
    : 0;
  const hasApprovedQuantityOverride = Boolean(
    isUnitReward &&
    submittedQuantity !== null &&
    Number.isFinite(approvedQuantity) &&
    approvedQuantity !== submittedQuantity,
  );
  const needsQuantityOverrideConfirmation =
    hasApprovedQuantityOverride && approvedQuantityValidation.valid && !quantityOverrideConfirmed;
  const unitBoundsText = [
    unitMin !== null ? `ขั้นต่ำ ${formatUnitQuantity(unitMin)} ${unitLabel}` : null,
    unitMax !== null ? `สูงสุด ${formatUnitQuantity(unitMax)} ${unitLabel}` : null,
  ].filter((item): item is string => Boolean(item)).join(' · ');

  const setApprovedQuantityInput = (value: string) => {
    setApprovedQuantityDraft({ submissionId: submission.id, value: normalizeWholeQuantityInput(value) });
  };

  const setApprovedQuantityValue = (quantity: number | null | undefined) => {
    if (quantity === null || quantity === undefined || !Number.isFinite(quantity)) return;

    setApprovedQuantityDraft({ submissionId: submission.id, value: String(Math.trunc(quantity)) });
  };

  const adjustApprovedQuantity = (direction: -1 | 1) => {
    const integerStep = Math.max(1, Math.round(unitStep));
    const current = Number.isFinite(approvedQuantity) && approvedQuantity > 0
      ? approvedQuantity
      : submittedQuantity ?? unitMin ?? integerStep;
    const minValue = unitMin ?? integerStep;
    const maxValue = unitMax ?? Number.MAX_SAFE_INTEGER;
    const nextValue = Math.min(Math.max(current + direction * integerStep, minValue), maxValue);

    setApprovedQuantityValue(nextValue);
  };

  const handleReview = async (status: ReviewStatus) => {
    if (!currentUser || !canReview) return;

    if (status === 'approved' && isUnitReward && (
      !approvedQuantityValidation.valid
    )) {
      setReviewError(approvedQuantityValidation.message || 'กรุณากรอกจำนวนที่อนุมัติให้ถูกต้อง');
      return;
    }

    if (status === 'approved' && needsQuantityOverrideConfirmation) {
      setReviewError('กรุณากดยืนยันการปรับจำนวนก่อนอนุมัติผลงาน');
      return;
    }

    setReviewError('');
    setProcessing(true);

    const rewardUpdates = {
        approved_quantity: status === 'approved' && isUnitReward ? approvedQuantity : null,
        approved_reward_amount: status === 'approved' && isUnitReward ? approvedRewardAmount : null,
    };

    try {
      await taskStore.reviewSubmission(
        submission.id,
        status,
        reviewComment,
        currentUser.id,
        reviewRating,
        rewardUpdates,
      );

      const nextTaskStatus: TaskStatus = status === 'approved' ? 'approved' : 'rejected';
      await taskStore.updateTaskStatus(submission.task_id, nextTaskStatus, rewardUpdates);

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

      router.push('/manager/review');
    } catch (error) {
      setReviewError(getReviewActionErrorMessage(error));
    } finally {
      setProcessing(false);
    }
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
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in pb-10">
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_410px]">
        <div className="min-w-0 space-y-6">
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
                allowDownload
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

        <div className="min-w-0 space-y-6">
          <Card padding="none" className="sticky top-6 overflow-hidden shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-br from-white via-slate-50 to-emerald-50/50 px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Review</p>
                  <h3 className="mt-1 text-lg font-black text-slate-950">สถานะการตรวจสอบ</h3>
                </div>
                <Badge variant={submission.review_status === 'pending' ? 'warning' : submission.review_status === 'approved' ? 'success' : 'danger'}>
                  {submission.review_status === 'pending' ? 'รอตรวจ' : submission.review_status === 'approved' ? 'อนุมัติแล้ว' : 'ไม่ผ่าน'}
                </Badge>
              </div>
            </div>

            <div className="space-y-5 px-5 py-5">
              {(submission.review_status === 'pending' || initialFeedback.rating != null) && (
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <label className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500" /> คะแนนผลงาน
                  </label>
                  <StarRating
                    className="mt-3"
                    value={reviewRating}
                    onChange={(value) => setReviewRatingDraft({ submissionId: submission.id, value })}
                    disabled={submission.review_status !== 'pending'}
                    size="lg"
                  />
                  {submission.review_status === 'pending' && (
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      ลากบนแถบดาวหรือกดเลือกคะแนนได้ทันที
                    </p>
                  )}
                </div>
              )}

              {isUnitReward && (
                <div className="rounded-[22px] border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-emerald-950">ค่าตอบแทนตามจำนวน</p>
                      <p className="mt-1 text-xs font-semibold text-emerald-700">{formatThaiCurrency(unitRate)}/{unitLabel}</p>
                    </div>
                    {unitBoundsText && (
                      <span className="max-w-[180px] rounded-2xl bg-white px-3 py-2 text-right text-[11px] font-bold leading-4 text-emerald-700 shadow-sm">
                        {unitBoundsText}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-emerald-100 bg-white/90 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">พนักงานส่งมา</p>
                      <p className="mt-1 text-base font-black text-slate-950">
                        {submittedQuantity != null ? formatUnitQuantity(submittedQuantity) : '-'} {unitLabel}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-white/90 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">ยอดจ่าย</p>
                      <p className="mt-1 text-base font-black text-emerald-700">
                        {formatThaiCurrency(approvedRewardAmount ?? 0)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor="approved-quantity" className="text-sm font-bold text-slate-800">
                        จำนวน{unitLabel}ที่อนุมัติ
                      </label>
                      {submittedQuantity != null && submission.review_status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => setApprovedQuantityValue(submittedQuantity)}
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100"
                        >
                          ใช้จำนวนที่ส่ง
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] gap-2">
                      <button
                        type="button"
                        onClick={() => adjustApprovedQuantity(-1)}
                        disabled={submission.review_status !== 'pending' || (Number.isFinite(approvedQuantity) && unitMin !== null && approvedQuantity <= unitMin)}
                        className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="ลดจำนวนที่อนุมัติ"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        id="approved-quantity"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={approvedQuantityInput}
                        onChange={(event) => setApprovedQuantityInput(event.target.value)}
                        disabled={submission.review_status !== 'pending'}
                        aria-invalid={!approvedQuantityValidation.valid}
                        className={`
                          h-12 w-full rounded-xl border bg-white px-3 text-center text-lg font-black text-slate-950 shadow-sm
                          outline-none transition-colors placeholder:text-slate-300
                          focus:border-primary-500 focus:ring-2 focus:ring-primary-500
                          disabled:bg-slate-50 disabled:text-slate-500
                          ${approvedQuantityValidation.valid ? 'border-slate-300' : 'border-red-400 focus:border-red-500 focus:ring-red-500'}
                        `}
                      />
                      <button
                        type="button"
                        onClick={() => adjustApprovedQuantity(1)}
                        disabled={submission.review_status !== 'pending' || (Number.isFinite(approvedQuantity) && unitMax !== null && approvedQuantity >= unitMax)}
                        className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="เพิ่มจำนวนที่อนุมัติ"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    {approvedQuantityValidation.valid ? (
                      <p className="text-xs leading-5 text-slate-500">
                        รับเฉพาะจำนวนเต็ม ถ้าปรับไม่ตรงกับที่พนักงานส่ง ระบบจะให้ยืนยันก่อนอนุมัติ
                      </p>
                    ) : (
                      <p className="text-xs leading-5 text-red-600">
                        {approvedQuantityValidation.message}
                      </p>
                    )}
                  </div>

                  {hasApprovedQuantityOverride && approvedQuantityValidation.valid && (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/95 p-4 shadow-sm">
                      <div className="flex gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-amber-600 shadow-sm">
                          <AlertTriangle className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-amber-950">จำนวนอนุมัติไม่ตรงกับจำนวนที่ส่ง</p>
                          <p className="mt-1 text-xs leading-5 text-amber-800">
                            {approvedQuantityDiff > 0 ? 'เพิ่ม' : 'ลด'} {formatUnitQuantity(Math.abs(approvedQuantityDiff))} {unitLabel}
                            {' '}จากที่พนักงานส่งมา กรุณายืนยันก่อนบันทึกยอดจ่าย
                          </p>
                          <button
                            type="button"
                            onClick={() => setQuantityOverrideConfirmed((current) => !current)}
                            className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                              quantityOverrideConfirmed
                                ? 'bg-emerald-600 text-white'
                                : 'bg-white text-amber-800 shadow-sm hover:bg-amber-100'
                            }`}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            {quantityOverrideConfirmed ? 'ยืนยันการปรับจำนวนแล้ว' : 'กดยืนยันการปรับจำนวนนี้'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <TextArea
                label="ผลการตรวจสอบ / ข้อเสนอแนะ"
                placeholder="ระบุข้อสังเกตหรือข้อแนะนำเพิ่มเติม"
                rows={4}
                value={reviewComment}
                onChange={(event) => setReviewCommentDraft({ submissionId: submission.id, value: event.target.value })}
                className="bg-slate-50 focus:bg-white"
                disabled={submission.review_status !== 'pending'}
              />

              {submission.review_status === 'pending' ? (
                <div className="space-y-2">
                  {reviewError && (
                    <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700">
                      {reviewError}
                    </div>
                  )}
                  <Button
                    variant="success"
                    fullWidth
                    loading={processing}
                    disabled={isUnitReward && (!approvedQuantityValidation.valid || needsQuantityOverrideConfirmation)}
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
                <div className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500 space-y-2">
                  {reviewRating != null && (
                    <StarRating value={reviewRating} readOnly size="sm" />
                  )}
                  <div>
                    ตรวจโดย {reviewer?.full_name || 'ผู้จัดการ'} เมื่อ {formatThaiDateTime(submission.reviewed_at || submission.submitted_at)}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 px-5 py-4">
              <p className="text-center text-[11px] leading-relaxed text-slate-400">
                เมื่ออนุมัติหรือปฏิเสธงานแล้ว ระบบจะอัปเดตสถานะงาน ส่งคะแนน และส่งการแจ้งเตือนไปยังพนักงานทันที
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
