import type { Metadata } from 'next';
import InventoryManagementWorkspace from '@/components/commerce/InventoryManagementWorkspace';

export const metadata: Metadata = { title: 'บริหารสต๊อกสินค้า | PS Rice Commerce' };

export default function InventoryManagementPage() {
  return <InventoryManagementWorkspace />;
}
