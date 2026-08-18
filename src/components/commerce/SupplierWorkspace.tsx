'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CirclePlus, Pencil, Search, Sparkles, X } from 'lucide-react';
import { CommerceShell } from '@/components/commerce/CommerceShell';
import { CommerceInitialState } from '@/components/commerce/CommerceInitialState';
import { formatBaht } from '@/lib/commerce';
import { getAccessToken } from '@/lib/supabase';

type Supplier = {
  id: string;
  code: string | null;
  name: string;
  contact_name: string | null;
  phone: string | null;
  link: string | null;
  email: string | null;
  address: string | null;
  tax_id: string | null;
  payment_terms_days: number;
  is_active: boolean;
  order_count: number;
  total_order_value: number;
  latest_order_date: string | null;
};

type SupplierForm = Omit<Supplier, 'id' | 'order_count' | 'total_order_value' | 'latest_order_date'>;
const emptyForm: SupplierForm = { code: null, name: '', contact_name: null, phone: null, link: null, email: null, address: null, tax_id: null, payment_terms_days: 0, is_active: true };

async function api(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'ทำรายการไม่สำเร็จ');
  return body;
}

function Field({ label, value, onChange, placeholder, type = 'text', required = false }: { label: string; value: string | null; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean }) {
  return <label className="block text-sm font-medium text-slate-700">{label}{required ? <span className="text-red-600"> *</span> : null}<input required={required} type={type} value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700" /></label>;
}

function nextSupplierCode(suppliers: Supplier[]) {
  const largestCode = suppliers.reduce((largest, supplier) => {
    const code = supplier.code?.trim() || '';
    return /^\d+$/.test(code) && Number.isSafeInteger(Number(code)) ? Math.max(largest, Number(code)) : largest;
  }, 10000);
  return String(largestCode + 1);
}

export default function SupplierWorkspace() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('กำลังโหลดผู้ขายคู่ค้า…');
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api('/api/commerce/suppliers') as { suppliers: Supplier[] };
      setSuppliers(result.suppliers);
      setStatus('ข้อมูลล่าสุดแล้ว');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'โหลดข้อมูลคู่ค้าไม่สำเร็จ');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('th');
    return suppliers.filter((supplier) => (showInactive || supplier.is_active) && (!needle || [supplier.code, supplier.name, supplier.contact_name, supplier.phone, supplier.tax_id].some((value) => value?.toLocaleLowerCase('th').includes(needle))));
  }, [query, showInactive, suppliers]);

  const openNew = () => { setEditingId(null); setForm(emptyForm); setEditorOpen(true); };
  const openEdit = (supplier: Supplier) => {
    setEditingId(supplier.id);
    setForm({ code: supplier.code, name: supplier.name, contact_name: supplier.contact_name, phone: supplier.phone, link: supplier.link, email: supplier.email, address: supplier.address, tax_id: supplier.tax_id, payment_terms_days: supplier.payment_terms_days, is_active: supplier.is_active });
    setEditorOpen(true);
  };
  const generateSupplierCode = () => setForm((value) => ({ ...value, code: nextSupplierCode(suppliers) }));

  const save = async () => {
    if (!form.name.trim() || !form.code?.trim() || !form.phone?.trim()) { setStatus('กรอกชื่อผู้ขายคู่ค้า รหัสคู่ค้า และเบอร์โทร'); return; }
    try {
      setSaving(true);
      const result = await api('/api/commerce/suppliers', { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify({ ...form, id: editingId }) }) as { supplier: Supplier };
      setSuppliers((current) => editingId ? current.map((item) => item.id === editingId ? { ...item, ...result.supplier } : item) : [result.supplier, ...current]);
      setEditorOpen(false);
      setStatus(editingId ? `บันทึกข้อมูล ${result.supplier.name} แล้ว` : `เพิ่ม ${result.supplier.name} แล้ว สามารถเลือกในใบสั่งซื้อได้ทันที`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'บันทึกผู้ขายคู่ค้าไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  if (loading && !suppliers.length) return <CommerceShell section="backoffice"><main className="mx-auto max-w-[1500px] px-4 py-6"><CommerceInitialState status={status} onRetry={() => void load()} label="กำลังโหลดผู้ขายคู่ค้า…" /></main></CommerceShell>;

  return <CommerceShell section="backoffice">
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold text-primary-800">ข้อมูลกลาง · ใช้ร่วมกันทุกสาขา</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">ผู้ขาย / คู่ค้า</h1><p className="mt-1 text-sm text-slate-500">ทะเบียนผู้ขายและเงื่อนไขการซื้อสำหรับทุกสาขา</p></div>
        <button type="button" onClick={openNew} className="inline-flex h-10 items-center gap-2 bg-primary-800 px-4 text-sm font-semibold text-white hover:bg-primary-900"><CirclePlus className="h-4 w-4" />เพิ่มคู่ค้าใหม่</button>
      </header>
      <p className="min-h-8 py-2 text-xs text-slate-500" role="status">{status}</p>
      <div className="flex flex-col gap-3 border-y border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อ รหัส เบอร์โทร หรือเลขผู้เสียภาษี" className="h-10 w-full border border-slate-300 pl-10 pr-3 text-sm outline-none focus:border-primary-700" /></label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} className="h-4 w-4 accent-emerald-800" />แสดงคู่ค้าที่ปิดใช้งาน</label>
      </div>
      <section className="overflow-hidden border-b border-slate-200 bg-white">
        <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-50 text-xs font-medium text-slate-500"><tr><th className="px-4 py-3">ผู้ขายคู่ค้า</th><th className="px-4 py-3">ผู้ติดต่อ</th><th className="px-4 py-3">เงื่อนไขชำระ</th><th className="px-4 py-3 text-right">จำนวน PO</th><th className="px-4 py-3 text-right">ยอดสั่งซื้อรวม</th><th className="px-4 py-3">สั่งล่าสุด</th><th className="w-20 px-4 py-3"></th></tr></thead>
          <tbody>{filtered.map((supplier) => <tr key={supplier.id} role="button" tabIndex={0} aria-label={`เปิดข้อมูล ${supplier.name}`} onClick={() => openEdit(supplier)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEdit(supplier); } }} className={`cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-100 active:bg-slate-200 focus-visible:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-300 ${supplier.is_active ? '' : 'text-slate-400'}`}><td className="px-4 py-3"><div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center bg-slate-100 text-slate-500"><Building2 className="h-4 w-4" /></span><span><strong className="block font-semibold text-slate-800">{supplier.name}</strong><span className="text-xs text-slate-500">{supplier.code || 'ไม่มีรหัส'}{!supplier.is_active ? ' · ปิดใช้งาน' : ''}</span></span></div></td><td className="px-4 py-3"><p>{supplier.contact_name || '-'}</p>{supplier.phone ? <p className="mt-0.5 text-xs text-slate-500">{supplier.phone}</p> : null}</td><td className="px-4 py-3">{supplier.payment_terms_days ? `เครดิต ${supplier.payment_terms_days} วัน` : 'เงินสด / ไม่กำหนดเครดิต'}</td><td className="px-4 py-3 text-right">{supplier.order_count.toLocaleString('th-TH')}</td><td className="px-4 py-3 text-right font-medium">{formatBaht(supplier.total_order_value)}</td><td className="px-4 py-3">{supplier.latest_order_date ? new Date(`${supplier.latest_order_date}T00:00:00`).toLocaleDateString('th-TH') : '-'}</td><td className="px-4 py-3"><button type="button" onClick={(event) => { event.stopPropagation(); openEdit(supplier); }} onKeyDown={(event) => event.stopPropagation()} className="inline-flex h-9 items-center gap-1.5 px-2 text-xs font-semibold text-primary-800 hover:bg-primary-50"><Pencil className="h-3.5 w-3.5" />แก้ไข</button></td></tr>)}{!filtered.length ? <tr><td colSpan={7} className="px-4 py-16 text-center"><Building2 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-medium">ไม่พบผู้ขายคู่ค้า</p><button type="button" onClick={openNew} className="mt-2 text-sm font-semibold text-primary-800 hover:underline">เพิ่มคู่ค้ารายแรก</button></td></tr> : null}</tbody>
        </table></div>
      </section>
    </main>

    {editorOpen ? <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35"><button type="button" className="absolute inset-0" aria-label="ปิด" onClick={() => !saving && setEditorOpen(false)} /><section role="dialog" aria-modal="true" aria-label={editingId ? 'แก้ไขผู้ขายคู่ค้า' : 'เพิ่มผู้ขายคู่ค้า'} className="relative flex h-dvh w-full max-w-xl flex-col bg-[#f8f9f8] shadow-2xl"><header className="flex h-16 items-center border-b border-slate-200 bg-white px-5"><div><h2 className="font-semibold">{editingId ? 'แก้ไขผู้ขายคู่ค้า' : 'เพิ่มผู้ขายคู่ค้าใหม่'}</h2><p className="text-xs text-slate-500">ข้อมูลบังคับ: ชื่อบริษัทหรือร้านค้า</p></div><button type="button" onClick={() => setEditorOpen(false)} className="ml-auto grid h-9 w-9 place-items-center text-slate-500 hover:bg-slate-100" aria-label="ปิด"><X className="h-5 w-5" /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5"><section className="border-b border-slate-200 pb-5"><label className="block text-sm font-medium text-slate-700">ชื่อบริษัท / ร้านค้า <span className="text-red-600">*</span><input autoFocus value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} placeholder="เช่น บริษัท ไทยค้าข้าว จำกัด" className="mt-1.5 h-11 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700" /></label><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-slate-700">รหัสคู่ค้า <span className="text-red-600">*</span><div className="mt-1.5 flex h-10 border border-slate-300 bg-white focus-within:border-primary-700"><input required value={form.code || ''} onChange={(event) => setForm((value) => ({ ...value, code: event.target.value }))} className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" /><button type="button" onClick={generateSupplierCode} className="group grid w-11 shrink-0 place-items-center border-l border-slate-200 text-primary-700 transition hover:bg-primary-50 hover:text-primary-900" aria-label="สร้างรหัสคู่ค้าอัตโนมัติ" title="สร้างรหัสคู่ค้าอัตโนมัติ"><Sparkles className="h-4 w-4 transition-transform group-hover:scale-110" /></button></div><span className="mt-1 block text-xs font-normal text-slate-500">กดปุ่มประกายดาวเพื่อสร้างรหัสลำดับถัดไป</span></label><Field label="ชื่อผู้ติดต่อ" value={form.contact_name} onChange={(contact_name) => setForm((value) => ({ ...value, contact_name }))} placeholder="ชื่อฝ่ายขายที่ติดต่อประจำ" /></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="เบอร์โทร" value={form.phone} onChange={(phone) => setForm((value) => ({ ...value, phone }))} type="tel" required /><label className="block text-sm font-medium text-slate-700">เครดิต (วัน)<input type="number" min="0" step="1" value={form.payment_terms_days} onChange={(event) => setForm((value) => ({ ...value, payment_terms_days: Math.max(0, Number(event.target.value) || 0) }))} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700" /></label></div></section>
      <section className="pt-5"><h3 className="text-sm font-semibold">ข้อมูลสำหรับเอกสารและบัญชี</h3><p className="mt-1 text-xs text-slate-500">ข้อมูลสำหรับ PO และเอกสารภาษี</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="อีเมล" value={form.email} onChange={(email) => setForm((value) => ({ ...value, email }))} type="email" /><Field label="เลขประจำตัวผู้เสียภาษี" value={form.tax_id} onChange={(tax_id) => setForm((value) => ({ ...value, tax_id }))} /></div><Field label="ลิงก์" value={form.link} onChange={(link) => setForm((value) => ({ ...value, link }))} placeholder="เช่น https://example.com" type="url" /><label className="mt-4 block text-sm font-medium text-slate-700">ที่อยู่<textarea value={form.address || ''} onChange={(event) => setForm((value) => ({ ...value, address: event.target.value }))} rows={4} className="mt-1.5 w-full resize-none border border-slate-300 bg-white p-3 text-sm outline-none focus:border-primary-700" /></label>{editingId ? <label className="mt-5 flex items-start gap-3 border-t border-slate-200 pt-5"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm((value) => ({ ...value, is_active: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-emerald-800" /><span><strong className="block text-sm">เปิดใช้งานคู่ค้ารายนี้</strong><span className="text-xs text-slate-500">ปิดใช้งานโดยไม่กระทบประวัติใบสั่งซื้อ</span></span></label> : null}</section></div>
      <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4"><button type="button" onClick={() => setEditorOpen(false)} disabled={saving} className="h-10 px-4 text-sm text-slate-600">ยกเลิก</button><button type="button" onClick={() => void save()} disabled={saving || !form.name.trim() || !form.code?.trim() || !form.phone?.trim()} className="h-10 bg-primary-800 px-5 text-sm font-semibold text-white hover:bg-primary-900 disabled:bg-slate-300">{saving ? 'กำลังบันทึก…' : editingId ? 'บันทึกการแก้ไข' : 'เพิ่มคู่ค้า'}</button></footer></section></div> : null}
  </CommerceShell>;
}
