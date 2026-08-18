'use client';

import Select from '@/components/ui/Select';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CommerceShell } from '@/components/commerce/CommerceShell';
import { CommerceInitialState } from '@/components/commerce/CommerceInitialState';
import { CommerceBootstrap, formatBaht, toNumber } from '@/lib/commerce';
import { getAccessToken } from '@/lib/supabase';

type EntryType = 'income' | 'expense';
type ExpenseAction = 'approve' | 'reject' | 'mark_paid';
type FinanceEntry = {
  id: string;
  category: string;
  amount: number | string;
  payment_method: string;
  note: string | null;
  income_date?: string;
  expense_date?: string;
  payer_name?: string | null;
  payee_name?: string | null;
  status?: 'pending' | 'approved' | 'rejected' | 'paid';
};
type FinancePayload = { incomes: FinanceEntry[]; expenses: FinanceEntry[] };

const paymentLabels: Record<string, string> = { cash: 'เงินสด', qr: 'QR รับเงิน', transfer: 'โอนเงิน', card: 'บัตร', other: 'อื่น ๆ' };
const expenseLabels: Record<NonNullable<FinanceEntry['status']>, string> = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', paid: 'จ่ายแล้ว' };
const today = () => new Date().toISOString().slice(0, 10);

async function commerceFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'ทำรายการไม่สำเร็จ');
  return body;
}

export default function FinanceWorkspace() {
  const [bootstrap, setBootstrap] = useState<CommerceBootstrap | null>(null);
  const [finance, setFinance] = useState<FinancePayload>({ incomes: [], expenses: [] });
  const [entryType, setEntryType] = useState<EntryType>('expense');
  const [entryDate, setEntryDate] = useState(today);
  const [category, setCategory] = useState('');
  const [partyName, setPartyName] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('กำลังโหลดข้อมูลการเงิน…');
  const [working, setWorking] = useState(false);

  const load = useCallback(async (branchId?: string) => {
    try {
      setStatus('กำลังโหลดข้อมูลการเงิน…');
      const base = await commerceFetch(`/api/commerce/bootstrap${branchId ? `?branch_id=${encodeURIComponent(branchId)}` : ''}`) as CommerceBootstrap;
      const result = await commerceFetch(`/api/commerce/finance?branch_id=${encodeURIComponent(base.branchId)}`) as FinancePayload;
      setBootstrap(base);
      setFinance(result);
      setStatus('พร้อมบันทึกและติดตามกระแสเงินสด');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'ไม่สามารถโหลดข้อมูลการเงินได้');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const income = finance.incomes.reduce((sum, item) => sum + toNumber(item.amount), 0);
    const paid = finance.expenses.filter((item) => item.status === 'paid').reduce((sum, item) => sum + toNumber(item.amount), 0);
    const approved = finance.expenses.filter((item) => item.status === 'approved' || item.status === 'paid').reduce((sum, item) => sum + toNumber(item.amount), 0);
    const pending = finance.expenses.filter((item) => item.status === 'pending').reduce((sum, item) => sum + toNumber(item.amount), 0);
    return { income, paid, approved, pending };
  }, [finance]);

  const submitEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bootstrap) return;
    try {
      setWorking(true);
      await commerceFetch('/api/commerce/finance', { method: 'POST', body: JSON.stringify({ type: entryType, branch_id: bootstrap.branchId, entry_date: entryDate, category, party_name: partyName, amount, payment_method: paymentMethod, note }) });
      setCategory(''); setPartyName(''); setAmount(''); setNote('');
      await load(bootstrap.branchId);
      setStatus(entryType === 'income' ? 'บันทึกรายรับแล้ว' : 'บันทึกรายจ่ายเพื่อรออนุมัติแล้ว');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'บันทึกรายการไม่สำเร็จ');
    } finally { setWorking(false); }
  };

  const updateExpense = async (expenseId: string, action: ExpenseAction) => {
    if (!bootstrap) return;
    try {
      setWorking(true);
      await commerceFetch('/api/commerce/finance', { method: 'PATCH', body: JSON.stringify({ expense_id: expenseId, action }) });
      await load(bootstrap.branchId);
      setStatus(action === 'approve' ? 'อนุมัติรายจ่ายแล้ว' : action === 'reject' ? 'ปฏิเสธรายจ่ายแล้ว' : 'บันทึกว่าเบิกจ่ายแล้ว');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'เปลี่ยนสถานะไม่สำเร็จ');
    } finally { setWorking(false); }
  };

  if (!bootstrap) return <CommerceShell section="finance"><main className="mx-auto max-w-[1420px] px-3 py-5 sm:px-5"><CommerceInitialState status={status} onRetry={() => void load()} label="กำลังโหลดข้อมูลการเงิน…" /></main></CommerceShell>;
  return <CommerceShell section="finance"><div className="mx-auto max-w-[1420px] px-3 py-5 sm:px-5">
    <header className="border-b border-slate-200 pb-4"><p className="text-xs font-medium text-primary-800">Commerce / Finance</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">การเงินสาขา</h1><p className="mt-1 text-sm text-slate-500">{status}</p></header>
    <dl className="grid border-b border-slate-200 sm:grid-cols-2 lg:grid-cols-4"><Metric label="รายรับที่บันทึก" value={formatBaht(totals.income)} /><Metric label="รายจ่ายที่จ่ายแล้ว" value={formatBaht(totals.paid)} /><Metric label="ภาระที่อนุมัติ" value={formatBaht(totals.approved)} /><Metric label="รออนุมัติ" value={formatBaht(totals.pending)} emphasize /></dl>
    <div className="mt-5 grid gap-6 xl:grid-cols-[21rem_minmax(0,1fr)]"><section className="border border-slate-200 bg-white"><div className="flex border-b border-slate-200"><button type="button" onClick={() => setEntryType('expense')} className={`h-11 flex-1 text-sm font-medium ${entryType === 'expense' ? 'border-b-2 border-primary-800 text-primary-800' : 'text-slate-500'}`}>บันทึกรายจ่าย</button><button type="button" onClick={() => setEntryType('income')} className={`h-11 flex-1 text-sm font-medium ${entryType === 'income' ? 'border-b-2 border-primary-800 text-primary-800' : 'text-slate-500'}`}>บันทึกรายรับ</button></div><form onSubmit={submitEntry} className="space-y-3 p-4"><Field label="วันที่"><input required type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} className="field" /></Field><Field label="หมวดรายการ"><input required value={category} onChange={(event) => setCategory(event.target.value)} placeholder={entryType === 'income' ? 'เช่น รายรับอื่น ๆ' : 'เช่น ค่าขนส่ง'} className="field" /></Field><Field label={entryType === 'income' ? 'ผู้ชำระเงิน' : 'ผู้รับเงิน'}><input value={partyName} onChange={(event) => setPartyName(event.target.value)} placeholder="ไม่บังคับ" className="field" /></Field><div className="grid grid-cols-2 gap-3"><Field label="จำนวนเงิน"><input required min="0.01" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="field" /></Field><Field label="วิธีรับ/จ่าย"><Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="field bg-white">{Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field></div><Field label="หมายเหตุ"><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="field h-auto resize-y py-2" /></Field><button disabled={working || !bootstrap} className="h-10 w-full bg-primary-800 text-sm font-medium text-white disabled:bg-slate-300">{working ? 'กำลังบันทึก…' : entryType === 'income' ? 'บันทึกรายรับ' : 'ส่งขออนุมัติรายจ่าย'}</button></form></section><section className="min-w-0 border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h2 className="text-sm font-semibold">รายจ่ายและการอนุมัติ</h2><p className="mt-0.5 text-xs text-slate-500">อนุมัติแล้วจึงบันทึกว่าได้จ่ายเงิน</p></div><span className="text-xs text-slate-500">{finance.expenses.length} รายการ</span></div><FinanceTable entries={finance.expenses} type="expense" working={working} onExpenseAction={updateExpense} /></section></div>
    <section className="mt-6 border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold">รายรับที่บันทึก</h2><span className="text-xs text-slate-500">{finance.incomes.length} รายการ</span></div><FinanceTable entries={finance.incomes} type="income" working={working} onExpenseAction={updateExpense} /></section>
  </div></CommerceShell>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-medium text-slate-700">{label}<span className="mt-1.5 block [&_.field]:h-10 [&_.field]:w-full [&_.field]:border [&_.field]:border-slate-300 [&_.field]:px-2 [&_.field]:text-sm [&_.field]:outline-none [&_.field:focus]:border-primary-700">{children}</span></label>; }
function Metric({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) { return <div className="border-r border-slate-200 px-4 py-4 last:border-r-0"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className={`mt-1 text-lg font-semibold tracking-tight ${emphasize ? 'text-amber-700' : 'text-slate-900'}`}>{value}</dd></div>; }
function FinanceTable({ entries, type, working, onExpenseAction }: { entries: FinanceEntry[]; type: EntryType; working: boolean; onExpenseAction: (expenseId: string, action: ExpenseAction) => void }) { return <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">วันที่ / หมวด</th><th className="px-4 py-3">คู่รายการ</th><th className="px-4 py-3">ช่องทาง</th><th className="px-4 py-3 text-right">จำนวนเงิน</th>{type === 'expense' ? <><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3 text-right">การดำเนินการ</th></> : null}</tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="border-t border-slate-100 align-top"><td className="px-4 py-3"><p className="font-medium text-slate-800">{entry.category}</p><p className="mt-0.5 text-xs text-slate-500">{entry.income_date || entry.expense_date}</p>{entry.note ? <p className="mt-1 max-w-60 truncate text-xs text-slate-400">{entry.note}</p> : null}</td><td className="px-4 py-3 text-slate-600">{entry.payer_name || entry.payee_name || '-'}</td><td className="px-4 py-3 text-slate-600">{paymentLabels[entry.payment_method] || entry.payment_method}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{formatBaht(toNumber(entry.amount))}</td>{type === 'expense' ? <><td className="px-4 py-3 text-slate-600">{entry.status ? expenseLabels[entry.status] : '-'}</td><td className="px-4 py-3 text-right">{entry.status === 'pending' ? <><button type="button" disabled={working} onClick={() => onExpenseAction(entry.id, 'approve')} className="mr-2 text-xs font-medium text-primary-800 disabled:text-slate-300">อนุมัติ</button><button type="button" disabled={working} onClick={() => onExpenseAction(entry.id, 'reject')} className="text-xs text-red-700 disabled:text-slate-300">ไม่อนุมัติ</button></> : null}{entry.status === 'approved' ? <button type="button" disabled={working} onClick={() => onExpenseAction(entry.id, 'mark_paid')} className="text-xs font-medium text-primary-800 disabled:text-slate-300">บันทึกว่าจ่ายแล้ว</button> : null}</td></> : null}</tr>)}{!entries.length ? <tr><td colSpan={type === 'expense' ? 6 : 4} className="px-4 py-12 text-center text-sm text-slate-500">ยังไม่มี{type === 'income' ? 'รายรับ' : 'รายจ่าย'}ในสาขานี้</td></tr> : null}</tbody></table></div>; }
