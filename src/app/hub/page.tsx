import type { Metadata } from 'next';
import WorkspaceHub from '@/components/ecosystem/WorkspaceHub';

export const metadata: Metadata = {
  title: 'เลือกพื้นที่ทำงาน | PS Rice',
  description: 'เลือกใช้งานระบบจัดการงานหรือระบบขายสินค้าและ POS ของ PS Rice',
};

export default function HubPage() {
  return <WorkspaceHub />;
}
