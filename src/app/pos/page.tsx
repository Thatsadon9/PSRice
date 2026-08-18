import type { Metadata } from 'next';
import PosTerminal from '@/components/commerce/PosTerminal';

export const metadata: Metadata = { title: 'ขายหน้าร้าน | PS Rice Commerce' };

export default function PosPage() {
  return <PosTerminal />;
}
