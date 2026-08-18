import type { Metadata } from 'next';
import PromotionWorkspace from '@/components/commerce/PromotionWorkspace';

export const metadata: Metadata = { title: 'โปรโมชั่น | PS Rice Commerce' };
export default function PromotionsPage() { return <PromotionWorkspace />; }
