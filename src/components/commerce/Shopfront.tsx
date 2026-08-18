'use client';

import Select from '@/components/ui/Select';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatBaht, toNumber } from '@/lib/commerce';

type StoreUnit = { id: string; name: string; code: string; conversionToBase: number; isDefault: boolean };
type StoreProduct = { id: string; sku: string; name: string; description: string | null; categoryName: string | null; unitInventoryMode: 'shared_base' | 'separate_unit'; available: number; unit: StoreUnit; unitPrice: number };
type Branch = { id: string; name: string };
type Catalog = { branchId: string; branches: Branch[]; products: StoreProduct[] };
type CartLine = StoreProduct & { quantity: number };

const paymentOptions = [
  { value: 'bank_transfer', label: 'โอนเงินเข้าบัญชี' },
  { value: 'qr', label: 'QR รับชำระเงิน' },
  { value: 'cash_on_pickup', label: 'ชำระตอนรับสินค้า' },
];

async function storeFetch(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'ทำรายการไม่สำเร็จ');
  return body;
}

export default function Shopfront() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [payment, setPayment] = useState('bank_transfer');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('กำลังโหลดสินค้า…');
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<{ order_number: string; grand_total: number } | null>(null);

  const loadCatalog = useCallback(async (branchId?: string) => {
    try {
      setIsCatalogLoading(true);
      setCatalogError(null);
      setNotice('กำลังโหลดสินค้า…');
      const result = await storeFetch(`/api/store/catalog${branchId ? `?branch_id=${encodeURIComponent(branchId)}` : ''}`) as Catalog;
      setCatalog(result);
      setCart((current) => current.flatMap((line) => {
        const updated = result.products.find((product) => product.id === line.id && product.unit.id === line.unit.id);
        return updated ? [{ ...updated, quantity: Math.min(line.quantity, Math.floor(updated.available / (updated.unitInventoryMode === 'separate_unit' ? 1 : updated.unit.conversionToBase))) }] : [];
      }));
      setNotice(result.products.length ? `${result.products.length.toLocaleString('th-TH')} รายการพร้อมขาย` : 'สาขานี้ยังไม่มีสินค้าพร้อมขาย');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ไม่สามารถโหลดสินค้าได้';
      setCatalogError(message);
      setNotice(message);
    } finally {
      setIsCatalogLoading(false);
    }
  }, []);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('th-TH');
    if (!query) return catalog?.products || [];
    return (catalog?.products || []).filter((product) => `${product.name} ${product.sku} ${product.categoryName || ''}`.toLocaleLowerCase('th-TH').includes(query));
  }, [catalog, search]);
  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0), [cart]);
  const itemsInCart = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart]);

  const maxOrderQuantity = (product: StoreProduct) => Math.floor(product.available / (product.unitInventoryMode === 'separate_unit' ? 1 : product.unit.conversionToBase));
  const addToCart = (product: StoreProduct) => {
    setCart((current) => {
      const index = current.findIndex((line) => line.id === product.id && line.unit.id === product.unit.id);
      if (index === -1) return [...current, { ...product, quantity: 1 }];
      const next = [...current];
      next[index] = { ...next[index], quantity: Math.min(next[index].quantity + 1, maxOrderQuantity(product)) };
      return next;
    });
  };
  const updateQuantity = (productId: string, productUnitId: string, quantity: number) => setCart((current) => current.flatMap((line) => {
    if (line.id !== productId || line.unit.id !== productUnitId) return [line];
    const nextQuantity = Math.min(quantity, maxOrderQuantity(line));
    return nextQuantity > 0 ? [{ ...line, quantity: nextQuantity }] : [];
  }));

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!catalog || !cart.length) return;
    try {
      setWorking(true);
      const result = await storeFetch('/api/store/orders', { method: 'POST', body: JSON.stringify({ branch_id: catalog.branchId, customer_name: customerName, customer_phone: customerPhone, customer_email: customerEmail, fulfillment_method: fulfillment, delivery_address: address, payment_method: payment, note, items: cart.map((line) => ({ product_id: line.id, product_unit_id: line.unit.id, quantity: line.quantity })) }) }) as { order: { order_number: string; grand_total: number | string } };
      setCompletedOrder({ order_number: result.order.order_number, grand_total: toNumber(result.order.grand_total) });
      setCart([]); setCheckoutOpen(false); setNotice('สร้างคำสั่งซื้อแล้ว · สินค้าถูกจองแล้ว');
      await loadCatalog(catalog.branchId);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'ไม่สามารถสร้างคำสั่งซื้อได้'); }
    finally { setWorking(false); }
  };

  return <main className="min-h-dvh bg-[#f7f7f5] text-slate-900"><header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex h-15 max-w-[1320px] items-center justify-between gap-4 px-4 sm:px-6"><Link href="/shop" className="font-semibold tracking-tight">PS Rice <span className="font-normal text-slate-500">Store</span></Link><div className="flex items-center gap-4"><Link href="/commerce/branches?next=/commerce" className="text-sm text-slate-600 hover:text-primary-800">สำหรับพนักงาน</Link><button type="button" onClick={() => setCheckoutOpen(true)} disabled={!cart.length} className="border border-primary-800 bg-primary-800 px-3 py-2 text-sm font-medium text-white disabled:border-slate-200 disabled:bg-slate-200">ตะกร้า {itemsInCart ? `(${itemsInCart})` : ''}</button></div></div></header>
    <div className="mx-auto max-w-[1320px] px-4 py-8 sm:px-6"><div className="border-b border-slate-200 pb-6"><p className="text-xs font-medium tracking-wide text-primary-800">PS RICE ONLINE STORE</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">ข้าวดีจาก PS Rice ส่งตรงถึงคุณ</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">ราคาและจำนวนสินค้าอ้างอิงจากสต๊อกของสาขาแบบเดียวกับหน้าร้าน</p><div className="mt-5 flex flex-wrap items-center gap-3"><label className="text-xs font-medium text-slate-600">รับสินค้าจากสาขา<Select value={catalog?.branchId || ''} onChange={(event) => void loadCatalog(event.target.value)} className="ml-2 h-10 border border-slate-300 bg-white px-2 text-sm text-slate-800 outline-none focus:border-primary-700">{catalog?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></label><span className="text-sm text-slate-500">{notice}</span></div></div>
      {completedOrder ? <section className="mt-6 border-l-4 border-primary-800 bg-white px-5 py-4"><p className="text-sm font-semibold">รับคำสั่งซื้อ {completedOrder.order_number} แล้ว</p><p className="mt-1 text-sm text-slate-600">ยอดรวม {formatBaht(completedOrder.grand_total)} · สินค้าถูกจองแล้ว · รอการยืนยันการชำระเงิน</p></section> : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]"><section><div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3"><h2 className="text-base font-semibold">สินค้าในสาขา</h2><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อหรือรหัสสินค้า" disabled={isCatalogLoading} className="h-10 w-52 border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700 disabled:bg-slate-100" /></div><div className="divide-y divide-slate-200 border-b border-slate-200 bg-white">{isCatalogLoading ? Array.from({ length: 3 }, (_, index) => <div key={index} aria-hidden="true" className="flex animate-pulse items-center gap-4 px-4 py-5 sm:px-5"><div className="h-12 w-12 shrink-0 bg-slate-100" /><div className="flex-1"><div className="h-4 w-2/5 bg-slate-100" /><div className="mt-2 h-3 w-3/5 bg-slate-100" /></div><div className="h-4 w-20 bg-slate-100" /><div className="h-9 w-14 bg-slate-100" /></div>) : filteredProducts.map((product) => <article key={product.id} className="flex items-center gap-4 px-4 py-5 sm:px-5"><div className="grid h-12 w-12 shrink-0 place-items-center border border-primary-100 bg-primary-50 text-sm font-semibold text-primary-800">{product.name.slice(0, 1)}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-x-2"><h3 className="font-medium">{product.name}</h3>{product.categoryName ? <span className="text-xs text-slate-500">{product.categoryName}</span> : null}</div><p className="mt-1 text-xs text-slate-500">{product.description || `รหัสสินค้า ${product.sku}`} · เหลือ {product.available.toLocaleString('th-TH')} {product.unit.code}</p></div><div className="text-right"><p className="font-semibold tabular-nums">{formatBaht(product.unitPrice)}</p><p className="mt-0.5 text-xs text-slate-500">ต่อ {product.unit.name}</p></div><button type="button" onClick={() => addToCart(product)} className="border border-slate-300 px-3 py-2 text-sm font-medium hover:border-primary-700 hover:text-primary-800">เพิ่ม</button></article>)}{!isCatalogLoading && catalogError && !filteredProducts.length ? <div className="px-4 py-12 text-center"><p className="text-sm text-red-700">{catalogError}</p><button type="button" onClick={() => void loadCatalog(catalog?.branchId)} className="mt-3 border border-slate-300 px-3 py-2 text-sm font-medium hover:border-primary-700 hover:text-primary-800">ลองใหม่</button></div> : null}{!isCatalogLoading && !catalogError && !filteredProducts.length ? <p className="px-4 py-12 text-center text-sm text-slate-500">{search.trim() ? 'ไม่พบสินค้าที่ค้นหา' : 'สาขานี้ยังไม่มีสินค้าพร้อมขาย'}</p> : null}</div></section>
        <aside className="h-fit border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold">ตะกร้าสินค้า</h2><span className="text-xs text-slate-500">{itemsInCart} ชิ้น</span></div><div className="divide-y divide-slate-100">{cart.map((line) => <div key={`${line.id}:${line.unit.id}`} className="px-4 py-3"><div className="flex justify-between gap-3"><p className="min-w-0 truncate text-sm font-medium">{line.name}</p><p className="text-sm font-medium tabular-nums">{formatBaht(line.unitPrice * line.quantity)}</p></div><div className="mt-2 flex items-center gap-2"><button type="button" onClick={() => updateQuantity(line.id, line.unit.id, line.quantity - 1)} className="h-7 w-7 border border-slate-300 text-sm">−</button><span className="w-8 text-center text-sm tabular-nums">{line.quantity}</span><button type="button" onClick={() => updateQuantity(line.id, line.unit.id, line.quantity + 1)} disabled={line.quantity >= maxOrderQuantity(line)} className="h-7 w-7 border border-slate-300 text-sm disabled:text-slate-300">+</button><span className="ml-auto text-xs text-slate-500">{line.unit.name}</span></div></div>)}{!cart.length ? <p className="px-4 py-9 text-center text-sm text-slate-500">ยังไม่มีสินค้าในตะกร้า</p> : null}</div><div className="border-t border-slate-200 p-4"><div className="flex justify-between text-sm"><span>รวมสินค้า</span><strong className="tabular-nums">{formatBaht(subtotal)}</strong></div><button type="button" onClick={() => setCheckoutOpen(true)} disabled={!cart.length} className="mt-4 h-10 w-full bg-primary-800 text-sm font-medium text-white disabled:bg-slate-200">ดำเนินการสั่งซื้อ</button></div></aside></div>
    </div>{checkoutOpen ? <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/30 p-3 sm:p-8"><div className="mx-auto max-w-lg border border-slate-200 bg-white shadow-xl"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold">ยืนยันคำสั่งซื้อ</h2><p className="mt-0.5 text-xs text-slate-500">รวม {formatBaht(subtotal)}</p></div><button type="button" onClick={() => setCheckoutOpen(false)} className="text-sm text-slate-500">ปิด</button></div><form onSubmit={submitOrder} className="space-y-4 p-5"><label className="block text-xs font-medium text-slate-700">ชื่อผู้สั่งซื้อ<input required value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm outline-none focus:border-primary-700" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-medium text-slate-700">เบอร์โทรศัพท์<input required inputMode="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm outline-none focus:border-primary-700" /></label><label className="block text-xs font-medium text-slate-700">อีเมล (ถ้ามี)<input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm outline-none focus:border-primary-700" /></label></div><fieldset><legend className="text-xs font-medium text-slate-700">วิธีรับสินค้า</legend><div className="mt-2 flex gap-4 text-sm"><label><input checked={fulfillment === 'pickup'} onChange={() => setFulfillment('pickup')} type="radio" name="fulfillment" className="mr-1.5" />รับที่สาขา</label><label><input checked={fulfillment === 'delivery'} onChange={() => setFulfillment('delivery')} type="radio" name="fulfillment" className="mr-1.5" />จัดส่ง</label></div></fieldset>{fulfillment === 'delivery' ? <label className="block text-xs font-medium text-slate-700">ที่อยู่จัดส่ง<textarea required value={address} onChange={(event) => setAddress(event.target.value)} rows={3} className="mt-1.5 w-full border border-slate-300 p-3 text-sm outline-none focus:border-primary-700" /></label> : null}<label className="block text-xs font-medium text-slate-700">วิธีชำระเงิน<Select value={payment} onChange={(event) => setPayment(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-2 text-sm outline-none focus:border-primary-700">{paymentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></label><label className="block text-xs font-medium text-slate-700">หมายเหตุ (ถ้ามี)<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1.5 w-full border border-slate-300 p-3 text-sm outline-none focus:border-primary-700" /></label><button disabled={working} className="h-11 w-full bg-primary-800 text-sm font-medium text-white disabled:bg-slate-300">{working ? 'กำลังสร้างคำสั่งซื้อ…' : 'ยืนยันคำสั่งซื้อ'}</button></form></div></div> : null}</main>;
}
