import type { Metadata } from 'next';
import OnlineOrdersWorkspace from '@/components/commerce/OnlineOrdersWorkspace';

export const metadata: Metadata = { title: 'คำสั่งซื้อออนไลน์ | PS Rice Commerce' };

export default function OnlineOrdersPage() { return <OnlineOrdersWorkspace />; }
