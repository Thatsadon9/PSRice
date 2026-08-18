import type { Metadata } from 'next';
import FinanceWorkspace from '@/components/commerce/FinanceWorkspace';

export const metadata: Metadata = { title: 'การเงิน | PS Rice Commerce' };

export default function FinancePage() {
  return <FinanceWorkspace />;
}
