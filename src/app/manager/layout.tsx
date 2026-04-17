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
    <div className="min-h-dvh flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
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
        <main className="flex-1 pb-20 lg:pb-0 overflow-y-auto overflow-x-hidden">
          <div className="max-w-5xl mx-auto w-full p-4 md:p-6 min-w-0">
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
