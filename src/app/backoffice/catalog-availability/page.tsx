import type { Metadata } from 'next';
import BranchCatalogAvailabilityWorkspace from '@/components/commerce/BranchCatalogAvailabilityWorkspace';

export const metadata: Metadata = { title: 'สินค้าตามสาขา | PS Rice Commerce' };

export default function CatalogAvailabilityPage() {
  return <BranchCatalogAvailabilityWorkspace />;
}
