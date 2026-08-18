import type { Metadata } from 'next';
import { Suspense } from 'react';
import CommerceBranchSelector from '@/components/commerce/CommerceBranchSelector';

export const metadata: Metadata = { title: 'เลือกสาขา | PS Rice Commerce' };

export default function CommerceBranchSelectorPage() {
  return <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-[#f3f4f2] text-sm text-slate-500">กำลังเตรียมรายชื่อสาขา…</main>}><CommerceBranchSelector /></Suspense>;
}
