'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useBranchStore } from '@/store/branchStore';
import { useTaskStore } from '@/store/taskStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useHrStore } from '@/store/hrStore';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';
import Skeleton from '@/components/ui/Skeleton';
import { EMPLOYEE_NAV_ITEMS } from '@/lib/constants';
import { canUseEmployeeArea } from '@/lib/viewMode';

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, currentUser } = useAuthStore();
  const adminViewMode = useAuthStore(s => s.adminViewMode);
  const subscribeToCurrentUserProfile = useAuthStore(s => s.subscribeToCurrentUserProfile);
  const fetchEmployees = useEmployeeStore(s => s.fetchUsers);
  const subscribeToUserUpdates = useEmployeeStore(s => s.subscribeToUserUpdates);
  const fetchBranches = useBranchStore(s => s.fetchBranches);
  const subscribeToBranchUpdates = useBranchStore(s => s.subscribeToBranchUpdates);
  const fetchTasks = useTaskStore(s => s.fetchInitialData);
  const subscribeToTaskUpdates = useTaskStore(s => s.subscribeToTaskUpdates);
  const fetchAttendance = useAttendanceStore(s => s.fetchRecords);
  const subscribeToAttendanceUpdates = useAttendanceStore(s => s.subscribeToAttendanceUpdates);
  const fetchHrData = useHrStore(s => s.fetchInitialData);
  const subscribeToHrUpdates = useHrStore(s => s.subscribeToHrUpdates);
  const hrSchemaReady = useHrStore(s => s.schemaReady);
  const fetchNotifications = useNotificationStore(s => s.fetchNotifications);
  const subscribeToNotifications = useNotificationStore(s => s.subscribeToNotifications);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (currentUser && !canUseEmployeeArea(currentUser, adminViewMode)) {
      router.replace('/manager');
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
        fetchHrData(),
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
  }, [adminViewMode, currentUser, isAuthenticated, router, fetchBranches, fetchEmployees, fetchTasks, fetchAttendance, fetchHrData, fetchNotifications, currentUser?.id]);

  useEffect(() => {
    if (isAuthenticated && currentUser?.id && dataLoaded) {
       const cleanups = [
         subscribeToCurrentUserProfile(currentUser.id),
         subscribeToUserUpdates(),
         subscribeToBranchUpdates(),
         subscribeToTaskUpdates(),
         subscribeToAttendanceUpdates(),
         subscribeToNotifications(currentUser.id),
       ];

       if (hrSchemaReady) {
         cleanups.push(subscribeToHrUpdates());
       }

       return () => {
         cleanups.forEach((cleanup) => cleanup());
       };
    }
  }, [
    currentUser?.id,
    dataLoaded,
    hrSchemaReady,
    isAuthenticated,
    subscribeToAttendanceUpdates,
    subscribeToBranchUpdates,
    subscribeToCurrentUserProfile,
    subscribeToHrUpdates,
    subscribeToNotifications,
    subscribeToTaskUpdates,
    subscribeToUserUpdates,
  ]);

  if (!isAuthenticated || !currentUser || !dataLoaded) return (
    <div className="min-h-dvh bg-slate-50 flex flex-col">
      <div className="h-16 border-b border-slate-200 bg-white flex items-center px-4 justify-between">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
      <main className="flex-1 pb-20 max-w-lg mx-auto w-full p-4 space-y-6">
        <div className="flex gap-4">
          <Skeleton className="h-24 flex-1" />
          <Skeleton className="h-24 flex-1" />
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </main>
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 flex justify-around items-center px-2">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-slate-50">
      <Header />
      <main className="mx-auto w-full max-w-lg pb-24">
        {children}
      </main>
      <BottomNav items={EMPLOYEE_NAV_ITEMS} />
    </div>
  );
}
