'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, currentUser, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (isAuthenticated && currentUser) {
      router.replace('/hub');
    } else {
      router.replace('/login');
    }
  }, [currentUser, isAuthenticated, isLoading, router]);

  return (
    <div className="flex items-center justify-center min-h-dvh">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary-800 flex items-center justify-center animate-pulse">
          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <p className="text-sm text-slate-500">กำลังโหลด...</p>
      </div>
    </div>
  );
}
