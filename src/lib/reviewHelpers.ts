'use client';

import { supabase } from '@/lib/supabase';
import type { Notification, ReviewStatus, TaskSubmission, User } from '@/lib/types';

type NotificationInsert = Omit<Notification, 'id' | 'created_at'>;
type ReviewSubmissionStatus = Pick<TaskSubmission, 'id' | 'review_status'>;

const REVIEW_REQUEST_LINK_PREFIX = '/manager/review/';

interface ReviewRequestNotificationOptions {
  submissionId: string;
  taskId: string;
  taskTitle: string;
  submitterName: string;
  recipients: User[];
}

interface ReviewResultNotificationOptions {
  taskId: string;
  taskTitle: string;
  reviewerName: string;
  reviewStatus: ReviewStatus;
  reviewRating?: number | null;
  reviewComment?: string;
  recipientId: string;
}

export async function insertNotifications(notifications: NotificationInsert[]) {
  if (notifications.length === 0) return;

  const { error } = await supabase.from('notifications').insert(notifications);
  if (error) {
    throw error;
  }
}

export function getReviewRequestSubmissionId(notification: Pick<Notification, 'type' | 'link'>) {
  if (notification.type !== 'review' || !notification.link) {
    return null;
  }

  let pathname = notification.link;

  try {
    pathname = new URL(notification.link, 'https://workflow-pro.local').pathname;
  } catch {
    pathname = notification.link.split('?')[0];
  }

  if (!pathname.startsWith(REVIEW_REQUEST_LINK_PREFIX)) {
    return null;
  }

  const submissionId = pathname.slice(REVIEW_REQUEST_LINK_PREFIX.length).split('/')[0];
  return submissionId || null;
}

export function isResolvedReviewRequestNotification(
  notification: Pick<Notification, 'type' | 'link'>,
  submissions: ReviewSubmissionStatus[],
) {
  const submissionId = getReviewRequestSubmissionId(notification);

  if (!submissionId) {
    return false;
  }

  const submission = submissions.find((item) => item.id === submissionId);
  return Boolean(submission && submission.review_status !== 'pending');
}

export function isEffectivelyReadNotification(
  notification: Pick<Notification, 'type' | 'link' | 'is_read'>,
  submissions: ReviewSubmissionStatus[],
) {
  return notification.is_read || isResolvedReviewRequestNotification(notification, submissions);
}

export async function markReviewRequestNotificationsAsRead(submissionId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('type', 'review')
    .eq('is_read', false)
    .like('link', `${REVIEW_REQUEST_LINK_PREFIX}${submissionId}%`);

  if (error) {
    throw error;
  }
}

export function getReviewRecipients(users: User[], submitter: User | null | undefined) {
  if (!submitter) return [];

  const recipients: User[] = [];
  const seen = new Set<string>();

  for (const user of users) {
    if (user.status !== 'active' || seen.has(user.id)) {
      continue;
    }

    if (user.role === 'admin') {
      recipients.push(user);
      seen.add(user.id);
      continue;
    }

    if (user.role === 'manager' && user.branch_id === submitter.branch_id) {
      recipients.push(user);
      seen.add(user.id);
    }
  }

  return recipients;
}

export function canReviewSubmission(
  reviewer: User | null | undefined,
  submission: TaskSubmission,
  users: User[],
) {
  if (!reviewer || reviewer.role === 'employee') {
    return false;
  }

  if (reviewer.role === 'admin') {
    return true;
  }

  const submitter = users.find((user) => user.id === submission.submitted_by);
  return submitter?.branch_id === reviewer.branch_id;
}

export function getPendingReviewSubmissionsForUser(
  submissions: TaskSubmission[],
  reviewer: User | null | undefined,
  users: User[],
) {
  return submissions
    .filter((submission) => submission.review_status === 'pending' && canReviewSubmission(reviewer, submission, users))
    .sort((left, right) => {
      return new Date(right.submitted_at).getTime() - new Date(left.submitted_at).getTime();
    });
}

export function getReviewedSubmissionsForUser(
  submissions: TaskSubmission[],
  reviewer: User | null | undefined,
  users: User[],
) {
  return submissions
    .filter((submission) => submission.review_status !== 'pending' && canReviewSubmission(reviewer, submission, users))
    .sort((left, right) => {
      const rightTime = right.reviewed_at ?? right.submitted_at;
      const leftTime = left.reviewed_at ?? left.submitted_at;
      return new Date(rightTime).getTime() - new Date(leftTime).getTime();
    });
}

export function getPendingReviewCountForUser(
  submissions: TaskSubmission[],
  reviewer: User | null | undefined,
  users: User[],
) {
  return getPendingReviewSubmissionsForUser(submissions, reviewer, users).length;
}

export function buildReviewRequestNotifications({
  submissionId,
  taskId,
  taskTitle,
  submitterName,
  recipients,
}: ReviewRequestNotificationOptions): NotificationInsert[] {
  return recipients.map((recipient) => ({
    user_id: recipient.id,
    title: 'มีงานรออนุมัติ',
    message: `${submitterName} ส่งงาน "${taskTitle}" เข้ามารอตรวจสอบ`,
    type: 'review',
    is_read: false,
    link: `/manager/review/${submissionId}?task=${taskId}`,
  }));
}

export function buildReviewResultNotification({
  taskId,
  taskTitle,
  reviewerName,
  reviewStatus,
  reviewRating,
  reviewComment,
  recipientId,
}: ReviewResultNotificationOptions): NotificationInsert {
  const isApproved = reviewStatus === 'approved';
  const title = isApproved ? 'งานได้รับการอนุมัติ' : 'งานถูกตีกลับให้แก้ไข';
  const actionText = isApproved ? 'อนุมัติงาน' : 'ส่งงานกลับให้แก้ไข';
  const ratingSuffix = reviewRating != null ? ` คะแนน ${reviewRating}/5.` : '.';
  const commentSuffix = reviewComment?.trim()
    ? ` หมายเหตุ: ${reviewComment.trim()}`
    : '';

  return {
    user_id: recipientId,
    title,
    message: `${reviewerName} ${actionText} "${taskTitle}"${ratingSuffix}${commentSuffix}`,
    type: 'review',
    is_read: false,
    link: `/employee/tasks/${taskId}`,
  };
}
