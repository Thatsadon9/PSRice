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
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import Skeleton from '@/components/ui/Skeleton';
import { MANAGER_NAV_ITEMS, MANAGER_MOBILE_NAV_ITEMS } from '@/lib/constants';

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, currentUser } = useAuthStore();
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (currentUser && currentUser.role === 'employee') {
      router.replace('/employee');
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
  }, [currentUser, isAuthenticated, router, fetchBranches, fetchEmployees, fetchTasks, fetchAttendance, fetchHrData, fetchNotifications, currentUser?.id]);

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
    <div className="min-h-dvh flex bg-slate-50">
      <div className="hidden lg:block w-64 border-r border-slate-200 bg-white p-6">
        <Skeleton className="h-8 w-32 mb-8" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-16 border-b border-slate-200 bg-white flex items-center px-4 lg:px-6 justify-between">
          <Skeleton className="h-8 w-8 lg:hidden" />
          <Skeleton className="h-8 w-24 hidden lg:block" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
        <main className="flex-1 p-4 md:p-6 overflow-hidden">
          <div className="space-y-6 max-w-5xl mx-auto w-full">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-32 w-full" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-slate-50 flex">
      {/* Sidebar for tablet/desktop */}
      <Sidebar 
         items={MANAGER_NAV_ITEMS}
         isOpen={sidebarOpen}
         onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header showMenu onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-24 lg:pb-0">
          <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">
             {children}
          </div>
        </main>
        
        {/* Bottom Nav for mobile only */}
        <div className="lg:hidden">
           <BottomNav items={MANAGER_MOBILE_NAV_ITEMS} />
        </div>
      </div>
    </div>
  );
}
