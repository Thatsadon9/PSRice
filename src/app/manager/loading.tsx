'use client';

import { usePathname } from 'next/navigation';
import { ManagerPageSkeleton } from '@/components/layout/AppShellSkeleton';

export default function ManagerLoading() {
  const pathname = usePathname();

  return <ManagerPageSkeleton pathname={pathname} />;
}
