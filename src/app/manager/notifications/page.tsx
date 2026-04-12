'use client';

import NotificationCenter from '@/components/layout/NotificationCenter';
import { useAuthStore } from '@/store/authStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useTaskStore } from '@/store/taskStore';
import { getPendingReviewCountForUser } from '@/lib/reviewHelpers';

export default function ManagerNotificationsPage() {
  const { currentUser } = useAuthStore();
  const users = useEmployeeStore((state) => state.users);
  const submissions = useTaskStore((state) => state.submissions);
  const pendingReviewCount = getPendingReviewCountForUser(submissions, currentUser, users);

  return (
    <NotificationCenter
      backHref="/manager"
      reviewSummary={{
        count: pendingReviewCount,
        href: '/manager/review',
        title: 'งานรออนุมัติ',
        description: 'มีงานที่พนักงานส่งเข้ามาและกำลังรอ Manager/Admin ตรวจสอบ',
      }}
    />
  );
}
