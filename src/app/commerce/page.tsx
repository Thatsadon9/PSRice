import type { Metadata } from 'next';
import CommercePreview from '@/components/ecosystem/CommercePreview';

export const metadata: Metadata = {
  title: 'ระบบขายสินค้าและ POS | PS Rice',
  description: 'พื้นที่ออกแบบระบบขายสินค้าและ POS ของ PS Rice',
};

export default function CommercePage() {
  return <CommercePreview />;
}
