import type { Metadata } from 'next';
import Shopfront from '@/components/commerce/Shopfront';

export const metadata: Metadata = { title: 'สั่งซื้อข้าวออนไลน์ | PS Rice' };

export default function ShopPage() {
  return <Shopfront />;
}
