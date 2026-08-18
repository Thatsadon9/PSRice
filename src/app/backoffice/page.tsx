import type { Metadata } from 'next';
import BackofficeWorkspace from '@/components/commerce/BackofficeWorkspace';

export const metadata: Metadata = { title: 'สินค้าและบริการ | PS Rice Commerce' };

export default function BackofficePage() {
  return <BackofficeWorkspace />;
}
