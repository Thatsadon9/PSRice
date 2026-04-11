'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useBranchStore } from '@/store/branchStore';
import { useTaskStore } from '@/store/taskStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useNotificationStore } from '@/store/notificationStore';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import { MANAGER_NAV_ITEMS, MANAGER_MOBILE_NAV_ITEMS } from '@/lib/constants';

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, currentUser } = useAuthStore();
  const fetchEmployees = useEmployeeStore(s => s.fetchUsers);
  const fetchBranches = useBranchStore(s => s.fetchBranches);
  const fetchTasks = useTaskStore(s => s.fetchInitialData);
  const fetchAttendance = useAttendanceStore(s => s.fetchRecords);
  const fetchNotifications = useNotificationStore(s => s.fetchNotifications);
  const subscribeToNotifications = useNotificationStore(s => s.subscribeToNotifications);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    // Hydrate data sequentially to avoid massive concurrent spikes if slow network
    // For production, consider using React Query or SWR
    const hydrate = async () => {
      await fetchBranches();
      await fetchEmployees();
      await fetchTasks();
      await fetchAttendance();
      if (currentUser?.id) {
        await fetchNotifications(currentUser.id);
      }
      setDataLoaded(true);
    };
    hydrate();
  }, [isAuthenticated, router, fetchBranches, fetchEmployees, fetchTasks, fetchAttendance, fetchNotifications, currentUser?.id]);

  useEffect(() => {
    if (isAuthenticated && currentUser?.id) {
       const unsubscribe = subscribeToNotifications(currentUser.id);
       return () => unsubscribe();
    }
  }, [isAuthenticated, currentUser?.id, subscribeToNotifications]);

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
        <main className="flex-1 pb-20 lg:pb-0 overflow-y-auto">
          <div className="max-w-5xl mx-auto w-full p-4 md:p-6">
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
