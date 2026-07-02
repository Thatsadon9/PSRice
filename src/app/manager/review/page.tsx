'use client';
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
import {
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  CheckSquare,
  Clock3,
  FileText,
  Filter,
  ListChecks,
  MessageSquare,
  Paperclip,
  Search,
  SlidersHorizontal,
  Star,
  Type,
  Video,
  WalletCards,
  X,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import { Page, PageHeader } from '@/components/ui/Page';
import Select, { type SelectOption } from '@/components/ui/Select';
import SubmissionFilesGrid from '@/components/ui/SubmissionFilesGrid';
import StarRating from '@/components/ui/StarRating';
import Input, { TextArea } from '@/components/ui/Input';
import {
  PRIORITY_LABELS,
  PROOF_TYPE_LABELS,
} from '@/lib/constants';
import { formatThaiDateTime } from '@/lib/dateUtils';
import { parseReviewFeedback } from '@/lib/reviewFeedback';
import {
  calculateUnitReward,
  formatThaiCurrency,
  formatUnitQuantity,
  getMilestoneReward,
  getSubmittedQuantity,
  getUnitLabel,
  getUnitRate,
  isUnitRewardTask,
  validateUnitQuantity,
} from '@/lib/taskMilestones';
import type { FileType, Priority, ProofType, ReviewStatus, RewardType, TaskStatus, TaskSubmission } from '@/lib/types';
import {
  buildReviewResultNotification,
  getPendingReviewSubmissionsForUser,
  getReviewedSubmissionsForUser,
  insertNotifications,
} from '@/lib/reviewHelpers';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useTaskStore } from '@/store/taskStore';

type ReviewStatusFilter = 'all' | ReviewStatus;
type DateFilter = 'all' | 'today' | 'yesterday' | '7days' | '30days';
type ProofFilter = 'all' | ProofType;
type RewardFilter = 'all' | RewardType;
type UrgencyFilter = 'all' | 'today' | 'older24h';
type SortFilter = 'newest' | 'oldest' | 'oldest_pending' | 'employee';

const ALL_VALUE = 'all';

const STATUS_FILTERS: Array<{ id: ReviewStatusFilter; label: string }> = [
  { id: 'pending', label: 'รอตรวจ' },
  { id: 'approved', label: 'อนุมัติแล้ว' },
  { id: 'rejected', label: 'ไม่ผ่าน' },
  { id: 'all', label: 'ทั้งหมด' },
];

const DATE_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'ทุกวัน' },
  { value: 'today', label: 'วันนี้', icon: <CalendarDays className="h-4 w-4" />, visualVariant: 'plain' },
  { value: 'yesterday', label: 'เมื่อวาน' },
  { value: '7days', label: '7 วันล่าสุด' },
  { value: '30days', label: '30 วันล่าสุด' },
];

const PROOF_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'ทุกหลักฐาน' },
  { value: 'photo', label: PROOF_TYPE_LABELS.photo, icon: <Camera className="h-4 w-4" />, visualVariant: 'plain' },
  { value: 'video', label: PROOF_TYPE_LABELS.video, icon: <Video className="h-4 w-4" />, visualVariant: 'plain' },
  { value: 'text', label: PROOF_TYPE_LABELS.text, icon: <Type className="h-4 w-4" />, visualVariant: 'plain' },
  { value: 'checklist', label: PROOF_TYPE_LABELS.checklist, icon: <ListChecks className="h-4 w-4" />, visualVariant: 'plain' },
  { value: 'any', label: PROOF_TYPE_LABELS.any, icon: <Paperclip className="h-4 w-4" />, visualVariant: 'plain' },
];

const REWARD_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'ทุกค่าตอบแทน' },
  { value: 'fixed', label: 'เหมาจ่ายเมื่องานผ่าน', icon: <WalletCards className="h-4 w-4" />, visualVariant: 'plain' },
  { value: 'unit', label: 'คิดตามจำนวนที่ทำได้', icon: <ListChecks className="h-4 w-4" />, visualVariant: 'plain' },
];

const SORT_OPTIONS: SelectOption[] = [
  { value: 'newest', label: 'ใหม่สุดก่อน' },
  { value: 'oldest_pending', label: 'ค้างนานสุดก่อน' },
  { value: 'oldest', label: 'เก่าสุดก่อน' },
  { value: 'employee', label: 'เรียงตามพนักงาน' },
];

function normalizeWholeQuantityInput(value: string) {
  const [wholePart = ''] = value.replace(/[^\d.]/g, '').split('.');
  return wholePart.replace(/^0+(?=\d)/, '');
}

function getStartOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameLocalDay(value: string, target: Date) {
  const date = new Date(value);
  return date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth() &&
    date.getDate() === target.getDate();
}

function matchesDateFilter(value: string, filter: DateFilter) {
  if (filter === 'all') return true;

  const now = new Date();
  const date = new Date(value);
  const todayStart = getStartOfLocalDay(now);

  if (filter === 'today') {
    return isSameLocalDay(value, todayStart);
  }

  if (filter === 'yesterday') {
    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    return isSameLocalDay(value, yesterday);
  }

  const days = filter === '7days' ? 7 : 30;
  const start = new Date(todayStart);
  start.setDate(start.getDate() - (days - 1));
  return date >= start;
}

function hoursSince(value: string) {
  return (Date.now() - new Date(value).getTime()) / (1000 * 60 * 60);
}

function formatRelativeThaiTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60)));

  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชม.ที่แล้ว`;

  return `${Math.floor(hours / 24)} วันที่แล้ว`;
}

function getFileTypeLabel(fileType: FileType) {
  if (fileType === 'image') return 'รูป';
  if (fileType === 'video') return 'วิดีโอ';
  return 'เอกสาร';
}

function getStatusVariant(status: ReviewStatus) {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  return 'warning';
}

function getStatusLabel(status: ReviewStatus) {
  if (status === 'approved') return 'อนุมัติแล้ว';
  if (status === 'rejected') return 'ไม่ผ่าน';
  return 'รอตรวจ';
}

function getInitials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || '?').toUpperCase();
}

function getReviewActionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return 'ตรวจงานไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง';
}

export default function ManagerReviewPage() {
  const taskStore = useTaskStore();
  const employeeStore = useEmployeeStore();
  const branchStore = useBranchStore();
  const currentUser = useAuthStore((state) => state.currentUser);

  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState(ALL_VALUE);
  const [employeeFilter, setEmployeeFilter] = useState(ALL_VALUE);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [proofFilter, setProofFilter] = useState<ProofFilter>('all');
  const [rewardFilter, setRewardFilter] = useState<RewardFilter>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>('all');
  const [sortFilter, setSortFilter] = useState<SortFilter>('newest');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<TaskSubmission | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewRating, setReviewRating] = useState<number | null>(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [approvedQuantityInput, setApprovedQuantityInput] = useState('');
  const [reviewError, setReviewError] = useState('');

  const activeEmployees = employeeStore.users.filter((user) => user.status !== 'inactive');
  const pendingSubmissions = getPendingReviewSubmissionsForUser(taskStore.submissions, currentUser, activeEmployees);
  const reviewedSubmissions = getReviewedSubmissionsForUser(taskStore.submissions, currentUser, activeEmployees);
  const reviewSubmissions = [...pendingSubmissions, ...reviewedSubmissions].filter((submission, index, submissions) =>
    submissions.findIndex((item) => item.id === submission.id) === index
  );

  const getSubmissionDetails = (submission: TaskSubmission | null) => {
    if (!submission) return null;

    const employee = employeeStore.getUserById(submission.submitted_by);
    const task = taskStore.getTaskById(submission.task_id);
    const template = task?.template_id ? taskStore.getTemplateById(task.template_id) : null;
    const files = taskStore.getFilesBySubmission(submission.id);
    const reviewer = submission.reviewed_by ? employeeStore.getUserById(submission.reviewed_by) : null;
    const feedback = parseReviewFeedback(submission.review_comment, submission.review_rating);
    const branchId = employee?.branch_id || template?.branch_id || null;
    const branch = branchId ? branchStore.getBranchById(branchId) : null;

    return { submission, employee, task, template, files, reviewer, feedback, branch };
  };

  const getProofMeta = (submission: TaskSubmission) => {
    const item = getSubmissionDetails(submission);
    const proofType = (item?.task?.proof_type_required || item?.template?.proof_type_required || 'any') as ProofType;
    const files = item?.files || [];
    const fileSummary = files.length > 0
      ? files.reduce<Record<FileType, number>>((summary, file) => {
          summary[file.file_type] = (summary[file.file_type] || 0) + 1;
          return summary;
        }, { image: 0, video: 0, document: 0 })
      : null;
    const fileText = fileSummary
      ? (Object.entries(fileSummary) as Array<[FileType, number]>)
          .filter(([, count]) => count > 0)
          .map(([type, count]) => `${getFileTypeLabel(type)} ${count}`)
          .join(' · ')
      : 'ยังไม่มีไฟล์แนบ';

    return {
      type: proofType,
      label: PROOF_TYPE_LABELS[proofType],
      fileText,
      filesCount: files.length,
    };
  };

  const getRewardMeta = (submission: TaskSubmission) => {
    const item = getSubmissionDetails(submission);
    if (!item?.task) {
      return { type: 'fixed' as RewardType, label: '-', description: 'ไม่พบข้อมูลงาน' };
    }

    const isUnitReward = isUnitRewardTask(item.task, item.template);
    if (isUnitReward) {
      const unitLabel = getUnitLabel(item.task, item.template);
      const unitRate = getUnitRate(item.task, item.template);
      const submittedQuantity = getSubmittedQuantity(item.task, item.submission);
      return {
        type: 'unit' as RewardType,
        label: `${formatThaiCurrency(unitRate)}/${unitLabel}`,
        description: submittedQuantity != null
          ? `ส่งมา ${formatUnitQuantity(submittedQuantity)} ${unitLabel}`
          : 'คิดตามจำนวนที่อนุมัติ',
      };
    }

    return {
      type: 'fixed' as RewardType,
      label: formatThaiCurrency(getMilestoneReward(item.task, item.template)),
      description: 'เหมาจ่ายเมื่องานผ่าน',
    };
  };

  const getSubmissionBranchName = (submission: TaskSubmission) => {
    const item = getSubmissionDetails(submission);
    return item?.branch?.name || 'ไม่ระบุสาขา';
  };

  const getSubmissionPriority = (submission: TaskSubmission) => {
    const item = getSubmissionDetails(submission);
    return (item?.task?.priority || item?.template?.priority || 'medium') as Priority;
  };

  const statusCounts = {
    all: reviewSubmissions.length,
    pending: reviewSubmissions.filter((submission) => submission.review_status === 'pending').length,
    approved: reviewSubmissions.filter((submission) => submission.review_status === 'approved').length,
    rejected: reviewSubmissions.filter((submission) => submission.review_status === 'rejected').length,
  };
  const pendingTodayCount = pendingSubmissions.filter((submission) => matchesDateFilter(submission.submitted_at, 'today')).length;
  const olderThan24Count = pendingSubmissions.filter((submission) => hoursSince(submission.submitted_at) >= 24).length;
  const reviewedTodayCount = reviewedSubmissions.filter((submission) =>
    matchesDateFilter(submission.reviewed_at || submission.submitted_at, 'today')
  ).length;

  const branchOptions: SelectOption[] = [
    { value: ALL_VALUE, label: 'ทุกสาขา' },
    ...branchStore.branches.map((branch) => ({
      value: branch.id,
      label: branch.name,
      description: `${reviewSubmissions.filter((submission) => getSubmissionDetails(submission)?.branch?.id === branch.id).length} รายการ`,
      icon: <Building2 className="h-4 w-4" />,
      visualVariant: 'plain' as const,
    })),
  ];

  const employeeOptions: SelectOption[] = [
    { value: ALL_VALUE, label: 'ทุกคน' },
    ...activeEmployees
      .filter((employee) => branchFilter === ALL_VALUE || employee.branch_id === branchFilter)
      .filter((employee) => reviewSubmissions.some((submission) => submission.submitted_by === employee.id))
      .map((employee) => ({
        value: employee.id,
        label: employee.full_name,
        description: branchStore.getBranchById(employee.branch_id)?.name || 'ไม่ระบุสาขา',
        avatarUrl: employee.avatar_url,
      })),
  ];

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredSubmissions = reviewSubmissions
    .filter((submission) => {
      const item = getSubmissionDetails(submission);
      if (!item) return false;

      const proofMeta = getProofMeta(submission);
      const rewardMeta = getRewardMeta(submission);
      const branchName = getSubmissionBranchName(submission);
      const priority = getSubmissionPriority(submission);
      const searchableText = [
        item.task?.title,
        item.template?.title,
        item.task?.description,
        item.template?.description,
        item.employee?.full_name,
        branchName,
        proofMeta.label,
        rewardMeta.label,
        PRIORITY_LABELS[priority],
      ].filter(Boolean).join(' ').toLowerCase();

      if (statusFilter !== 'all' && submission.review_status !== statusFilter) return false;
      if (branchFilter !== ALL_VALUE && item.branch?.id !== branchFilter) return false;
      if (employeeFilter !== ALL_VALUE && submission.submitted_by !== employeeFilter) return false;
      if (dateFilter !== 'all' && !matchesDateFilter(submission.submitted_at, dateFilter)) return false;
      if (proofFilter !== 'all' && proofMeta.type !== proofFilter) return false;
      if (rewardFilter !== 'all' && rewardMeta.type !== rewardFilter) return false;
      if (urgencyFilter === 'today' && !matchesDateFilter(submission.submitted_at, 'today')) return false;
      if (urgencyFilter === 'older24h' && (submission.review_status !== 'pending' || hoursSince(submission.submitted_at) < 24)) return false;
      if (normalizedSearch && !searchableText.includes(normalizedSearch)) return false;

      return true;
    })
    .sort((left, right) => {
      if (sortFilter === 'employee') {
        const leftEmployee = getSubmissionDetails(left)?.employee?.full_name || '';
        const rightEmployee = getSubmissionDetails(right)?.employee?.full_name || '';
        return leftEmployee.localeCompare(rightEmployee, 'th');
      }

      const leftTime = new Date(left.submitted_at).getTime();
      const rightTime = new Date(right.submitted_at).getTime();

      if (sortFilter === 'oldest' || sortFilter === 'oldest_pending') {
        return leftTime - rightTime;
      }

      return rightTime - leftTime;
    });

  const activeFilterCount = [
    searchQuery.trim(),
    branchFilter !== ALL_VALUE,
    employeeFilter !== ALL_VALUE,
    dateFilter !== 'all',
    proofFilter !== 'all',
    rewardFilter !== 'all',
    urgencyFilter !== 'all',
    sortFilter !== 'newest',
    statusFilter !== 'pending',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchQuery('');
    setBranchFilter(ALL_VALUE);
    setEmployeeFilter(ALL_VALUE);
    setDateFilter('all');
    setProofFilter('all');
    setRewardFilter('all');
    setUrgencyFilter('all');
    setSortFilter('newest');
    setStatusFilter('pending');
  };

  const openSubmission = (submission: TaskSubmission) => {
    const feedback = parseReviewFeedback(submission.review_comment, submission.review_rating);
    const detail = getSubmissionDetails(submission);
    const quantity = submission.approved_quantity ?? getSubmittedQuantity(detail?.task, submission);
    setSelectedSubmission(submission);
    setReviewComment(feedback.comment);
    setReviewRating(feedback.rating ?? (submission.review_status === 'pending' ? 0 : null));
    setApprovedQuantityInput(quantity != null ? normalizeWholeQuantityInput(String(quantity)) : '');
    setReviewError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedSubmission(null);
    setReviewComment('');
    setReviewRating(0);
    setApprovedQuantityInput('');
    setReviewError('');
  };

  const handleReview = async (status: ReviewStatus) => {
    if (!selectedSubmission || !currentUser) return;

    const detail = getSubmissionDetails(selectedSubmission);
    const isUnitReward = Boolean(detail?.task && isUnitRewardTask(detail.task, detail.template));
    const unitRate = detail?.task ? getUnitRate(detail.task, detail.template) : 0;
    const approvedQuantity = isUnitReward && approvedQuantityInput.trim() ? Number(approvedQuantityInput) : null;
    const approvedQuantityValidation = validateUnitQuantity(approvedQuantity, detail?.task, detail?.template);
    const approvedRewardAmount = isUnitReward && approvedQuantity !== null && Number.isFinite(approvedQuantity)
      ? calculateUnitReward(approvedQuantity, unitRate)
      : null;

    if (status === 'approved' && isUnitReward && !approvedQuantityValidation.valid) {
      setReviewError(approvedQuantityValidation.message || 'กรุณากรอกจำนวนที่อนุมัติให้ถูกต้อง');
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
        selectedSubmission.id,
        status,
        reviewComment,
        currentUser.id,
        reviewRating,
        rewardUpdates,
      );

      const nextTaskStatus: TaskStatus = status === 'approved' ? 'approved' : 'rejected';
      await taskStore.updateTaskStatus(selectedSubmission.task_id, nextTaskStatus, rewardUpdates);

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

      closeModal();
    } catch (error) {
      setReviewError(getReviewActionErrorMessage(error));
    } finally {
      setProcessing(false);
    }
  };

  const detail = getSubmissionDetails(selectedSubmission);

  return (
    <Page maxWidth="xl" className="space-y-6">
      <PageHeader
        title="ตรวจงาน"
        description="คิวตรวจงานแบบค้นหาและคัดกรองได้เร็ว เห็นคน สาขา หลักฐาน และค่าตอบแทนครบในหน้าเดียว"
        action={(
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm">
            <Filter className="h-4 w-4 text-primary-600" />
            {filteredSubmissions.length}/{reviewSubmissions.length} รายการ
          </div>
        )}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-amber-100 bg-amber-50/70">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-amber-700">รอตรวจทั้งหมด</p>
              <p className="mt-1 text-2xl font-black text-amber-950">{pendingSubmissions.length}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm">
              <Clock3 className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card className="border-emerald-100 bg-emerald-50/70">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-emerald-700">ส่งวันนี้</p>
              <p className="mt-1 text-2xl font-black text-emerald-950">{pendingTodayCount}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
              <CalendarDays className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card className="border-red-100 bg-red-50/70">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-red-700">ค้างเกิน 24 ชม.</p>
              <p className="mt-1 text-2xl font-black text-red-950">{olderThan24Count}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-red-600 shadow-sm">
              <Clock3 className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card className="border-blue-100 bg-blue-50/70">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-blue-700">ตรวจแล้ววันนี้</p>
              <p className="mt-1 text-2xl font-black text-blue-950">{reviewedTodayCount}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
        </Card>
      </div>

      <Card padding="none" className="overflow-visible">
        <div className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-3 xl:grid-cols-[minmax(280px,1fr)_190px_230px_170px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="ค้นหางาน พนักงาน สาขา หรือหลักฐาน"
                className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
            </div>

            <Select
              value={branchFilter}
              onChange={(event) => {
                setBranchFilter(event.target.value);
                setEmployeeFilter(ALL_VALUE);
              }}
              options={branchOptions}
              searchable
              placeholder="เลือกสาขา"
              aria-label="เลือกสาขา"
            />

            <Select
              value={employeeFilter}
              onChange={(event) => setEmployeeFilter(event.target.value)}
              options={employeeOptions}
              searchable
              placeholder="เลือกพนักงาน"
              aria-label="เลือกพนักงาน"
            />

            <Select
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value as DateFilter)}
              options={DATE_OPTIONS}
              aria-label="เลือกช่วงวันที่"
            />
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setStatusFilter(filter.id)}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${
                    statusFilter === filter.id
                      ? 'bg-primary-800 text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {filter.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${statusFilter === filter.id ? 'bg-white/20' : 'bg-slate-100'}`}>
                    {statusCounts[filter.id]}
                  </span>
                </button>
              ))}

              <button
                type="button"
                onClick={() => setUrgencyFilter(urgencyFilter === 'today' ? 'all' : 'today')}
                className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${
                  urgencyFilter === 'today'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'border border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                วันนี้
                <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-xs">{pendingTodayCount}</span>
              </button>

              <button
                type="button"
                onClick={() => setUrgencyFilter(urgencyFilter === 'older24h' ? 'all' : 'older24h')}
                className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${
                  urgencyFilter === 'older24h'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'border border-red-100 bg-red-50 text-red-700 hover:bg-red-100'
                }`}
              >
                ค้างเกิน 24 ชม.
                <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-xs">{olderThan24Count}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAdvancedFilters((current) => !current)}
                icon={<SlidersHorizontal className="h-4 w-4" />}
              >
                ตัวกรองเพิ่มเติม{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </Button>
              {activeFilterCount > 0 && (
                <Button variant="ghost" onClick={clearFilters} icon={<X className="h-4 w-4" />}>
                  ล้าง
                </Button>
              )}
            </div>
          </div>

          {showAdvancedFilters && (
            <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 md:grid-cols-3">
              <Select
                label="หลักฐาน"
                value={proofFilter}
                onChange={(event) => setProofFilter(event.target.value as ProofFilter)}
                options={PROOF_OPTIONS}
              />
              <Select
                label="ค่าตอบแทน"
                value={rewardFilter}
                onChange={(event) => setRewardFilter(event.target.value as RewardFilter)}
                options={REWARD_OPTIONS}
              />
              <Select
                label="เรียงลำดับ"
                value={sortFilter}
                onChange={(event) => setSortFilter(event.target.value as SortFilter)}
                options={SORT_OPTIONS}
              />
            </div>
          )}
        </div>
      </Card>

      {filteredSubmissions.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Search className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">ไม่พบงานตามตัวกรองนี้</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
            ลองเปลี่ยนสาขา พนักงาน หรือช่วงวันที่เพื่อดูงานที่ต้องตรวจ
          </p>
          {activeFilterCount > 0 && (
            <Button className="mt-5" variant="secondary" onClick={clearFilters}>
              ล้างตัวกรอง
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredSubmissions.map((submission) => {
            const item = getSubmissionDetails(submission);
            const isPending = submission.review_status === 'pending';
            const proofMeta = getProofMeta(submission);
            const rewardMeta = getRewardMeta(submission);
            const priority = getSubmissionPriority(submission);
            const isOldPending = isPending && hoursSince(submission.submitted_at) >= 24;

            return (
              <button
                key={submission.id}
                type="button"
                onClick={() => openSubmission(submission)}
                className={`group w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md ${
                  isOldPending ? 'border-red-200' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 gap-3">
                    {item?.employee?.avatar_url ? (
                      <img
                        src={item.employee.avatar_url}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-2xl border-2 border-white object-cover shadow-sm ring-1 ring-slate-100"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-sm font-black text-primary-700 ring-1 ring-primary-100">
                        {getInitials(item?.employee?.full_name)}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <p className="min-w-0 truncate text-base font-black text-slate-950">
                          {item?.task?.title || item?.template?.title || 'งานที่ส่งตรวจ'}
                        </p>
                        <Badge variant={getStatusVariant(submission.review_status)} dot>
                          {getStatusLabel(submission.review_status)}
                        </Badge>
                        {isOldPending && <Badge variant="danger">ค้างนาน</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                        <span>{item?.employee?.full_name || 'ไม่ระบุพนักงาน'}</span>
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {getSubmissionBranchName(submission)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" />
                          {formatRelativeThaiTime(submission.submitted_at)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant="info" className="bg-blue-50 text-blue-700">
                          {proofMeta.label}
                        </Badge>
                        <Badge variant={rewardMeta.type === 'unit' ? 'info' : 'slate'}>
                          {rewardMeta.label}
                        </Badge>
                        <Badge variant={priority === 'critical' ? 'danger' : priority === 'high' ? 'warning' : 'slate'}>
                          {PRIORITY_LABELS[priority]}
                        </Badge>
                        {proofMeta.filesCount > 0 && (
                          <Badge variant="slate">
                            {proofMeta.fileText}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
                    <span className="text-xs font-semibold text-slate-400">
                      {formatThaiDateTime(isPending ? submission.submitted_at : submission.reviewed_at || submission.submitted_at)}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">{rewardMeta.description}</span>
                    {item?.feedback.rating != null && <StarRating value={item.feedback.rating} readOnly size="sm" />}
                  </div>
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

              {detail.task && isUnitRewardTask(detail.task, detail.template) && (() => {
                const unitLabel = getUnitLabel(detail.task, detail.template);
                const unitRate = getUnitRate(detail.task, detail.template);
                const submittedQuantity = getSubmittedQuantity(detail.task, detail.submission);
                const approvedQuantity = approvedQuantityInput.trim() ? Number(approvedQuantityInput) : NaN;
                const approvedQuantityValidation = validateUnitQuantity(approvedQuantity, detail.task, detail.template);
                const rewardPreview = Number.isFinite(approvedQuantity)
                  ? calculateUnitReward(approvedQuantity, unitRate)
                  : 0;

                return (
                  <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-semibold text-emerald-900">ค่าตอบแทนตามจำนวน</span>
                      <span className="text-emerald-700">{formatThaiCurrency(unitRate)}/{unitLabel}</span>
                    </div>
                    <div className="rounded-lg bg-white/70 p-3 text-xs text-emerald-800">
                      พนักงานส่งมา {submittedQuantity != null ? formatUnitQuantity(submittedQuantity) : '-'} {unitLabel}
                    </div>
                    <Input
                      label={`จำนวน${unitLabel}ที่อนุมัติ`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={approvedQuantityInput}
                      onChange={(event) => setApprovedQuantityInput(normalizeWholeQuantityInput(event.target.value))}
                      disabled={detail.submission.review_status !== 'pending'}
                      error={approvedQuantityValidation.valid ? undefined : approvedQuantityValidation.message || undefined}
                      helperText={`ยอดจ่ายที่จะบันทึก ${formatThaiCurrency(rewardPreview)}`}
                    />
                  </div>
                );
              })()}

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
              <div className="space-y-3">
                {reviewError && (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {reviewError}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="danger" loading={processing} onClick={() => void handleReview('rejected')}>
                    ไม่อนุมัติ
                  </Button>
                  <Button loading={processing} onClick={() => void handleReview('approved')}>
                    อนุมัติ
                  </Button>
                </div>
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
