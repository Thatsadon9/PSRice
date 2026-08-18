'use client';

import Select from '@/components/ui/Select';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CommerceShell } from '@/components/commerce/CommerceShell';
import { CommerceInitialState } from '@/components/commerce/CommerceInitialState';
import { formatBaht, toNumber } from '@/lib/commerce';
import { getAccessToken } from '@/lib/supabase';

type Customer = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  member_code: string | null;
  referral_code: string | null;
  customer_type: string;
  points_balance: number | string;
  credit_limit: number | string;
  credit_balance: number | string;
};

type CustomerDetail = {
  customer: Customer & { created_at: string };
  summary: { completedSales: number; completedOnlineOrders: number; saleCount: number; onlineOrderCount: number };
  sales: Array<{ id: string; receipt_number: string; status: string; grand_total: number | string; completed_at: string; branch_name: string }>;
  online_orders: Array<{ id: string; order_number: string; status: string; grand_total: number | string; placed_at: string; branch_name: string; fulfillment_method: string }>;
  point_transactions: Array<{ id: string; points_delta: number | string; transaction_type: string; note: string | null; created_at: string }>;
};

async function commerceFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'ทำรายการไม่สำเร็จ');
  return body;
}

const customerTypes: Record<string, string> = {
  retail: 'ลูกค้าทั่วไป', member: 'สมาชิก', wholesale: 'ค้าส่ง', dealer: 'ตัวแทน',
};

const pointTypes: Record<string, string> = {
  earn: 'ได้รับแต้ม', redeem: 'ใช้แต้ม', adjustment: 'ปรับแต้ม', reversal: 'คืนแต้ม',
};

export default function CustomerWorkspace() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('กำลังโหลดรายชื่อลูกค้า…');
  const [initialLoading, setInitialLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState('retail');
  const [referral, setReferral] = useState('');
  const [creditCustomer, setCreditCustomer] = useState<Customer | null>(null);
  const [creditAmount, setCreditAmount] = useState('0');
  const [creditNote, setCreditNote] = useState('');

  const load = useCallback(async (search = '') => {
    try {
      const response = await commerceFetch(`/api/commerce/customers?q=${encodeURIComponent(search)}`) as { customers: Customer[] };
      setCustomers(response.customers);
      setStatus(response.customers.length ? `${response.customers.length} รายการ` : 'ยังไม่มีข้อมูลลูกค้า');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'โหลดไม่สำเร็จ');
    } finally { setInitialLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const createCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setWorking(true);
      await commerceFetch('/api/commerce/customers', { method: 'POST', body: JSON.stringify({ full_name: name, phone, customer_type: type, referred_by_code: referral }) });
      setName(''); setPhone(''); setReferral('');
      await load(query);
      setStatus('เพิ่มลูกค้าแล้ว');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'เพิ่มลูกค้าไม่สำเร็จ');
    } finally { setWorking(false); }
  };

  const openDetail = async (customerId: string) => {
    try {
      setDetailLoading(true);
      const response = await commerceFetch(`/api/commerce/customers/${customerId}`) as CustomerDetail;
      setDetail(response);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'โหลดประวัติลูกค้าไม่สำเร็จ');
    } finally { setDetailLoading(false); }
  };

  const receiveCreditPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!creditCustomer) return;
    try { setWorking(true); const context = await commerceFetch('/api/commerce/context') as { selectedBranchId: string }; await commerceFetch('/api/commerce/customer-credit', { method: 'POST', body: JSON.stringify({ branch_id: context.selectedBranchId, customer_id: creditCustomer.id, amount: toNumber(creditAmount), note: creditNote }) }); setCreditCustomer(null); setCreditAmount('0'); setCreditNote(''); await load(query); setStatus('รับชำระเครดิตและอัปเดตลูกหนี้แล้ว'); } catch (error) { setStatus(error instanceof Error ? error.message : 'รับชำระไม่สำเร็จ'); } finally { setWorking(false); }
  };

  if (initialLoading) return <CommerceShell section="backoffice"><main className="mx-auto max-w-[1320px] px-4 py-5"><CommerceInitialState status={status} onRetry={() => { setInitialLoading(true); void load(query); }} label="กำลังโหลดรายชื่อลูกค้า…" /></main></CommerceShell>;

  return <CommerceShell section="backoffice">
    <main className="mx-auto max-w-[1320px] px-4 py-5">
      <header className="border-b border-slate-200 pb-4">
        <p className="text-xs font-medium text-primary-800">Commerce / Customers</p>
        <h1 className="mt-1 text-2xl font-semibold">ลูกค้าและสมาชิก</h1>
        <p className="mt-1 text-sm text-slate-500">{status}</p>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-[20rem_1fr]">
        <form onSubmit={createCustomer} className="h-fit border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">เพิ่มลูกค้า</h2>
          <CustomerField label="ชื่อลูกค้า" value={name} onChange={setName} required />
          <CustomerField label="เบอร์โทรศัพท์" value={phone} onChange={setPhone} />
          <label className="mt-3 block text-xs font-medium">ประเภท
            <Select value={type} onChange={(event) => setType(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-2 text-sm">
              {Object.entries(customerTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </label>
          <CustomerField label="รหัสผู้แนะนำ" value={referral} onChange={(value) => setReferral(value.toUpperCase())} placeholder="REFXXXXXX (ถ้ามี)" />
          <button disabled={working} className="mt-4 h-10 w-full bg-primary-800 text-sm font-medium text-white disabled:bg-slate-300">{working ? 'กำลังบันทึก…' : 'บันทึกลูกค้า'}</button>
        </form>

        <section className="border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
            <h2 className="text-sm font-semibold">รายชื่อลูกค้า</h2>
            <input value={query} onChange={(event) => { setQuery(event.target.value); void load(event.target.value); }} placeholder="ค้นหาชื่อ, โทร, รหัสสมาชิก" className="h-9 w-full border border-slate-300 px-3 text-sm sm:w-64" />
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">ลูกค้า</th><th className="px-4 py-3">ประเภท / รหัส</th><th className="px-4 py-3 text-right">คะแนน</th><th className="px-4 py-3 text-right">เครดิตใช้ / วงเงิน</th><th className="px-4 py-3" /></tr></thead>
            <tbody>
              {customers.map((customer) => <tr key={customer.id} role="button" tabIndex={0} aria-label={`เปิดประวัติ ${customer.full_name}`} onClick={() => void openDetail(customer.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openDetail(customer.id); } }} className="cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-100 active:bg-slate-200 focus-visible:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-300">
                <td className="px-4 py-3"><p className="font-medium">{customer.full_name}</p><p className="mt-0.5 text-xs text-slate-500">{customer.phone || customer.email || '-'}</p></td>
                <td className="px-4 py-3"><p>{customerTypes[customer.customer_type] || customer.customer_type}</p><p className="mt-0.5 text-xs text-primary-800">{customer.member_code || customer.referral_code || '-'}</p></td>
                <td className="px-4 py-3 text-right tabular-nums">{toNumber(customer.points_balance).toLocaleString('th-TH')}</td>
                <td className="px-4 py-3 text-right tabular-nums"><span className={toNumber(customer.credit_balance) > 0 ? 'font-semibold text-amber-700' : ''}>{formatBaht(toNumber(customer.credit_balance))}</span><span className="text-slate-400"> / {formatBaht(toNumber(customer.credit_limit))}</span></td>
                <td className="px-4 py-3 text-right"><div className="flex justify-end gap-3">{toNumber(customer.credit_balance) > 0 ? <button type="button" onClick={(event) => { event.stopPropagation(); setCreditCustomer(customer); setCreditAmount(String(customer.credit_balance)); }} onKeyDown={(event) => event.stopPropagation()} className="text-xs font-medium text-amber-700 hover:underline">รับชำระ</button> : null}<button type="button" onClick={(event) => { event.stopPropagation(); void openDetail(customer.id); }} onKeyDown={(event) => event.stopPropagation()} className="text-xs font-medium text-primary-800 hover:underline">ประวัติ</button></div></td>
              </tr>)}
              {!customers.length && <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">ยังไม่มีข้อมูลลูกค้า</td></tr>}
            </tbody>
          </table></div>
        </section>
      </div>
    </main>

    {(detail || detailLoading) && <CustomerDetailPanel detail={detail} loading={detailLoading} onClose={() => setDetail(null)} />}
    {creditCustomer ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"><form onSubmit={receiveCreditPayment} className="w-full max-w-sm bg-white shadow-2xl"><div className="border-b border-slate-200 p-5"><h2 className="font-semibold">รับชำระเครดิต</h2><p className="mt-1 text-sm text-slate-600">{creditCustomer.full_name} · ค้าง {formatBaht(toNumber(creditCustomer.credit_balance))}</p></div><div className="space-y-4 p-5"><label className="block text-xs font-medium">จำนวนรับชำระ<input required min="0.01" max={toNumber(creditCustomer.credit_balance)} step="0.01" type="number" value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm" /></label><label className="block text-xs font-medium">เลขอ้างอิง / หมายเหตุ<input value={creditNote} onChange={(event) => setCreditNote(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm" /></label></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4"><button type="button" onClick={() => setCreditCustomer(null)} className="h-9 px-3 text-sm text-slate-600">ยกเลิก</button><button disabled={working} className="h-9 bg-primary-800 px-4 text-sm font-semibold text-white disabled:bg-slate-300">บันทึกรับชำระ</button></div></form></div> : null}
  </CommerceShell>;
}

function CustomerField({ label, value, onChange, placeholder, required }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean }) {
  return <label className="mt-3 block text-xs font-medium">{label}<input required={required} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm" /></label>;
}

function CustomerDetailPanel({ detail, loading, onClose }: { detail: CustomerDetail | null; loading: boolean; onClose: () => void }) {
  return <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30" role="dialog" aria-modal="true" aria-label="ประวัติลูกค้า">
    <section className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">
      <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4">
        <div><p className="text-xs font-medium text-primary-800">Customer history</p><h2 className="mt-1 text-lg font-semibold">{loading ? 'กำลังโหลด…' : detail?.customer.full_name}</h2><p className="mt-1 text-xs text-slate-500">{detail?.customer.member_code || detail?.customer.phone || '-'}</p></div>
        <button type="button" onClick={onClose} className="h-9 px-3 text-sm text-slate-600 hover:bg-slate-100">ปิด</button>
      </header>
      {loading || !detail ? <p className="p-6 text-sm text-slate-500">กำลังโหลดประวัติการซื้อและการใช้แต้ม…</p> : <div className="space-y-7 p-5">
        <div className="grid grid-cols-2 border border-slate-200 sm:grid-cols-4">
          <Summary label="ยอด POS" value={formatBaht(detail.summary.completedSales)} /><Summary label="ยอดออนไลน์" value={formatBaht(detail.summary.completedOnlineOrders)} />
          <Summary label="บิล POS" value={detail.summary.saleCount.toLocaleString('th-TH')} /><Summary label="ออเดอร์เว็บ" value={detail.summary.onlineOrderCount.toLocaleString('th-TH')} />
        </div>
        <HistoryTable title="รายการแต้ม" empty="ยังไม่มีรายการแต้ม" rows={detail.point_transactions.map((transaction) => ({ id: transaction.id, primary: `${toNumber(transaction.points_delta) > 0 ? '+' : ''}${toNumber(transaction.points_delta).toLocaleString('th-TH')} คะแนน`, secondary: `${pointTypes[transaction.transaction_type] || transaction.transaction_type}${transaction.note ? ` · ${transaction.note}` : ''}`, date: transaction.created_at, positive: toNumber(transaction.points_delta) > 0 }))} />
        <HistoryTable title="ประวัติขายหน้าร้าน" empty="ยังไม่มีรายการขายหน้าร้าน" rows={detail.sales.map((sale) => ({ id: sale.id, primary: sale.receipt_number, secondary: `${sale.branch_name} · ${sale.status}`, amount: formatBaht(toNumber(sale.grand_total)), date: sale.completed_at }))} />
        <HistoryTable title="ประวัติออเดอร์ออนไลน์" empty="ยังไม่มีออเดอร์ออนไลน์" rows={detail.online_orders.map((order) => ({ id: order.id, primary: order.order_number, secondary: `${order.branch_name} · ${order.fulfillment_method} · ${order.status}`, amount: formatBaht(toNumber(order.grand_total)), date: order.placed_at }))} />
      </div>}
    </section>
  </div>;
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="border-b border-r border-slate-200 px-3 py-3 text-right sm:border-b-0"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{value}</p></div>; }

function HistoryTable({ title, empty, rows }: { title: string; empty: string; rows: Array<{ id: string; primary: string; secondary: string; date: string; amount?: string; positive?: boolean }> }) {
  return <section><h3 className="border-b border-slate-200 pb-2 text-sm font-semibold">{title}</h3><div className="divide-y divide-slate-100">{rows.map((row) => <div key={row.id} className="flex items-start justify-between gap-4 py-3 text-sm"><div><p className={row.positive ? 'font-medium text-emerald-700' : 'font-medium'}>{row.primary}</p><p className="mt-0.5 text-xs text-slate-500">{row.secondary}</p></div><div className="shrink-0 text-right"><p className="font-medium tabular-nums">{row.amount}</p><p className="mt-0.5 text-xs text-slate-500">{new Date(row.date).toLocaleDateString('th-TH')}</p></div></div>)}{!rows.length && <p className="py-5 text-sm text-slate-500">{empty}</p>}</div></section>;
}
