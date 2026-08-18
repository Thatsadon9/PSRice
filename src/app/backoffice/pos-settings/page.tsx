import type { Metadata } from 'next';
import PosSettingsWorkspace from '@/components/commerce/PosSettingsWorkspace';

export const metadata: Metadata = { title: 'ตั้งค่า POS | PS Rice Commerce' };

export default function PosSettingsPage() {
  return <PosSettingsWorkspace />;
}
