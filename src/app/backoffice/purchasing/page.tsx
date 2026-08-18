import type { Metadata } from 'next';
import PurchasingWorkspace from '@/components/commerce/PurchasingWorkspace';

export const metadata: Metadata = { title: 'ใบสั่งซื้อ (PO) | PS Rice Commerce' };

export default function PurchasingPage() { return <PurchasingWorkspace />; }
