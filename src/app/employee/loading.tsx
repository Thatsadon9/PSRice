'use client';

import { usePathname } from 'next/navigation';
import { EmployeePageSkeleton } from '@/components/layout/AppShellSkeleton';

export default function EmployeeLoading() {
  const pathname = usePathname();

  return <EmployeePageSkeleton pathname={pathname} />;
}
