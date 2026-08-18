'use client';

import Link from 'next/link';
import { CommerceShell } from '@/components/commerce/CommerceShell';

export default function CommercePreview() {
  return <CommerceShell section="pos">
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="text-xs font-medium text-primary-800">PS RICE COMMERCE</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">เลือกพื้นที่ทำงาน</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">จุดขาย สต๊อก และคำสั่งซื้อบนฐานข้อมูลกลาง</p>

      <div className="mt-10 divide-y divide-slate-200 border-y border-slate-200 bg-white">
        <Link href="/pos" className="group flex items-center gap-5 px-5 py-6 transition hover:bg-slate-50 sm:px-7">
          <span className="grid h-10 w-10 shrink-0 place-items-center bg-primary-800 text-sm font-semibold text-white">01</span>
          <span className="min-w-0 flex-1"><span className="block text-lg font-semibold">ขายหน้าร้าน</span><span className="mt-1 block text-sm text-slate-500">เปิดกะ ค้นหาสินค้า รับชำระเงิน และออกใบเสร็จ</span></span>
          <span className="text-sm font-medium text-primary-800 group-hover:underline">เปิด POS</span>
        </Link>
        <Link href="/backoffice" className="group flex items-center gap-5 px-5 py-6 transition hover:bg-slate-50 sm:px-7">
          <span className="grid h-10 w-10 shrink-0 place-items-center bg-slate-900 text-sm font-semibold text-white">02</span>
          <span className="min-w-0 flex-1"><span className="block text-lg font-semibold">สินค้าและสต๊อก</span><span className="mt-1 block text-sm text-slate-500">เพิ่มสินค้า ดูยอดพร้อมขาย และบันทึกรับสินค้าเข้า</span></span>
          <span className="text-sm font-medium text-primary-800 group-hover:underline">เปิดหลังบ้าน</span>
        </Link>
        <Link href="/shop" className="group flex items-center gap-5 px-5 py-6 transition hover:bg-slate-50 sm:px-7">
          <span className="grid h-10 w-10 shrink-0 place-items-center bg-amber-700 text-sm font-semibold text-white">03</span>
          <span className="min-w-0 flex-1"><span className="block text-lg font-semibold">ร้านค้าออนไลน์</span><span className="mt-1 block text-sm text-slate-500">เลือกสาขา สั่งซื้อ และติดตามการเตรียมสินค้า</span></span>
          <span className="text-sm font-medium text-primary-800 group-hover:underline">เปิดร้านค้า</span>
        </Link>
      </div>

      <section className="mt-8 border-t border-slate-200 pt-5">
        <h2 className="text-sm font-semibold">เครื่องมือหลังบ้าน</h2>
        <div className="mt-3 grid border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['/backoffice/purchasing', 'จัดซื้อและรับสินค้า'], ['/backoffice/transfers', 'โอนสินค้าระหว่างสาขา'], ['/backoffice/stock-adjustments', 'ตรวจนับและปรับสต๊อก'],
            ['/backoffice/customers', 'ลูกค้าและสมาชิก'], ['/backoffice/online-orders', 'คำสั่งซื้อออนไลน์'], ['/backoffice/finance', 'การเงินสาขา'],
            ['/backoffice/commissions', 'คอมมิชชันผู้แนะนำ'], ['/backoffice/reports', 'รายงานภาพรวม'], ['/backoffice/access', 'สิทธิ์ Commerce'],
          ].map(([href, label]) => <Link key={href} href={href} className="border-b border-r border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-primary-800">{label}</Link>)}
        </div>
      </section>

      <p className="mt-6 text-xs leading-5 text-slate-500">เมนูและข้อมูลแสดงตามสิทธิ์ของบัญชี</p>
    </div>
  </CommerceShell>;
}
