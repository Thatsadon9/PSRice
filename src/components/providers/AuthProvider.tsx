'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import Skeleton from '@/components/ui/Skeleton';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore(s => s.initialize);
  const isLoading = useAuthStore(s => s.isLoading);

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <div className="min-h-dvh flex bg-slate-50">
        <div className="hidden lg:block w-64 border-r border-slate-200 bg-white p-6">
          <Skeleton className="h-8 w-32 mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        <div className="flex-1 flex flex-col">
          <div className="h-16 border-b border-slate-200 bg-white flex items-center px-4 lg:px-6 justify-between">
            <Skeleton className="h-8 w-8 lg:hidden" />
            <Skeleton className="h-8 w-24 hidden lg:block" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
          <div className="p-4 md:p-6 space-y-6 flex-1">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-32 w-full" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
