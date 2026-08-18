import type { Metadata } from 'next';
import GoodsReceiptWorkspace from '@/components/commerce/GoodsReceiptWorkspace';

export const metadata: Metadata = { title: 'ใบนำเข้าสินค้า | PS Rice Commerce' };

export default function GoodsReceiptsPage() { return <GoodsReceiptWorkspace />; }
