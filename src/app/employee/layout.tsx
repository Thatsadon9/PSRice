'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useBranchStore } from '@/store/branchStore';
import { useTaskStore } from '@/store/taskStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useNotificationStore } from '@/store/notificationStore';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import { EMPLOYEE_NAV_ITEMS } from '@/lib/constants';

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, currentUser } = useAuthStore();
  const fetchEmployees = useEmployeeStore(s => s.fetchUsers);
  const fetchBranches = useBranchStore(s => s.fetchBranches);
  const fetchTasks = useTaskStore(s => s.fetchInitialData);
  const subscribeToTaskUpdates = useTaskStore(s => s.subscribeToTaskUpdates);
  const fetchAttendance = useAttendanceStore(s => s.fetchRecords);
  const fetchNotifications = useNotificationStore(s => s.fetchNotifications);
  const subscribeToNotifications = useNotificationStore(s => s.subscribeToNotifications);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    let isActive = true;
    const hydrate = async () => {
      setDataLoaded(false);
      await Promise.allSettled([
        fetchBranches(),
        fetchEmployees(),
        fetchTasks(),
        fetchAttendance(),
        currentUser?.id ? fetchNotifications(currentUser.id) : Promise.resolve(),
      ]);

      if (isActive) {
        setDataLoaded(true);
      }
    };
    void hydrate();

    return () => {
      isActive = false;
    };
  }, [isAuthenticated, router, fetchBranches, fetchEmployees, fetchTasks, fetchAttendance, fetchNotifications, currentUser?.id]);

  useEffect(() => {
    if (isAuthenticated && currentUser?.id) {
       const unsubscribeNotifications = subscribeToNotifications(currentUser.id);
       const unsubscribeTasks = subscribeToTaskUpdates();
       return () => {
         unsubscribeNotifications();
         unsubscribeTasks();
       };
    }
  }, [isAuthenticated, currentUser?.id, subscribeToNotifications, subscribeToTaskUpdates]);

  if (!isAuthenticated || !currentUser || !dataLoaded) return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-slate-50">
      <Header />
      <main className="pb-20 max-w-lg mx-auto">
        {children}
      </main>
      <BottomNav items={EMPLOYEE_NAV_ITEMS} />
    </div>
  );
}
