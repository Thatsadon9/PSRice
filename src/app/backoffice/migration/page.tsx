import type { Metadata } from 'next';
import MigrationCenterWorkspace from '@/components/commerce/MigrationCenterWorkspace';

export const metadata: Metadata = { title: 'Migration Center | PS Rice Commerce' };
export default function MigrationCenterPage() { return <MigrationCenterWorkspace />; }
