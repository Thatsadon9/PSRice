'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CommerceShell } from '@/components/commerce/CommerceShell';
import { CommerceInitialState } from '@/components/commerce/CommerceInitialState';
import { COMMERCE_PAYMENT_METHODS, CommercePaymentMethod, PAYMENT_METHOD_LABELS } from '@/lib/commerce';
import { getPromptPayIdentifierType, normalizePromptPayId } from '@/lib/promptpay';
import { getAccessToken } from '@/lib/supabase';

type Settings = {
  promptpay_enabled: boolean; promptpay_id: string; promptpay_display_name: string; default_register_name: string;
  require_open_register: boolean; show_out_of_stock: boolean; enabled_payment_methods: CommercePaymentMethod[]; receipt_footer: string;
};

const blankSettings: Settings = { promptpay_enabled: false, promptpay_id: '', promptpay_display_name: '', default_register_name: 'Counter 1', require_open_register: true, show_out_of_stock: false, enabled_payment_methods: COMMERCE_PAYMENT_METHODS, receipt_footer: '' };

async function commerceFetch(path: string, init?: RequestInit) {
  const accessToken = await getAccessToken();
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'ทำรายการไม่สำเร็จ');
  return body;
}

export default function PosSettingsWorkspace() {
  const [branchId, setBranchId] = useState('');
  const [settings, setSettings] = useState<Settings>(blankSettings);
  const [status, setStatus] = useState('กำลังโหลดการตั้งค่า POS…');
  const [initialLoading, setInitialLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const load = useCallback(async (selectedBranchId?: string) => {
    try {
      setStatus('กำลังโหลดการตั้งค่า POS…');
      const response = await commerceFetch(`/api/commerce/pos-settings${selectedBranchId ? `?branch_id=${encodeURIComponent(selectedBranchId)}` : ''}`) as { branch_id: string; settings: Settings };
      setBranchId(response.branch_id); setSettings({ ...blankSettings, ...response.settings });
      setStatus('การเปลี่ยนแปลงมีผลกับจุดขายของสาขานี้ทันที');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'ไม่สามารถโหลดการตั้งค่าได้'); }
    finally { setInitialLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setWorking(true);
      await commerceFetch('/api/commerce/pos-settings', { method: 'PUT', body: JSON.stringify({ branch_id: branchId, ...settings }) });
      setSettings((current) => ({ ...current, promptpay_id: normalizePromptPayId(current.promptpay_id) }));
      setStatus('บันทึกการตั้งค่า POS แล้ว');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ'); }
    finally { setWorking(false); }
  };

  const promptpayType = getPromptPayIdentifierType(settings.promptpay_id);
  const toggleMethod = (method: CommercePaymentMethod) => setSettings((current) => ({ ...current, enabled_payment_methods: current.enabled_payment_methods.includes(method) ? current.enabled_payment_methods.filter((item) => item !== method) : [...current.enabled_payment_methods, method] }));

  if (initialLoading) return <CommerceShell section="pos-settings"><main className="mx-auto max-w-[1120px] px-4 py-5 sm:px-5"><CommerceInitialState status={status} onRetry={() => { setInitialLoading(true); void load(); }} label="กำลังโหลดการตั้งค่า POS…" /></main></CommerceShell>;

  return <CommerceShell section="pos-settings"><main className="mx-auto max-w-[1120px] px-4 py-5 sm:px-5">
    <header className="border-b border-slate-200 pb-4"><p className="text-xs font-medium text-primary-800">Commerce / POS</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">ตั้งค่าจุดขาย</h1><p className="mt-1 text-sm text-slate-500">{status}</p></header>

    <form onSubmit={save} className="mt-5 divide-y divide-slate-200 border border-slate-200 bg-white">
      <section className="grid gap-5 p-5 md:grid-cols-[13rem_minmax(0,1fr)]"><div><h2 className="text-sm font-semibold">PromptPay QR</h2><p className="mt-1 text-xs leading-5 text-slate-500">QR รับเงินพร้อมยอดชำระ</p></div><div className="space-y-4"><label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={settings.promptpay_enabled} onChange={(event) => setSettings((current) => ({ ...current, promptpay_enabled: event.target.checked, enabled_payment_methods: event.target.checked && !current.enabled_payment_methods.includes('qr') ? [...current.enabled_payment_methods, 'qr'] : current.enabled_payment_methods }))} className="h-4 w-4 accent-primary-800" />เปิดใช้ QR รับเงิน PromptPay</label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-medium text-slate-700">PromptPay ของ หจก. / สาขา<input disabled={!settings.promptpay_enabled} value={settings.promptpay_id} onChange={(event) => setSettings((current) => ({ ...current, promptpay_id: event.target.value }))} inputMode="numeric" placeholder="เลขผู้เสียภาษี 13 หลัก" className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm outline-none focus:border-primary-700 disabled:bg-slate-100" /></label><label className="block text-xs font-medium text-slate-700">ชื่อที่แสดงให้แคชเชียร์ตรวจสอบ<input disabled={!settings.promptpay_enabled} value={settings.promptpay_display_name} onChange={(event) => setSettings((current) => ({ ...current, promptpay_display_name: event.target.value }))} placeholder="เช่น หจก. พีเอส ไรซ์" className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm outline-none focus:border-primary-700 disabled:bg-slate-100" /></label></div><p className="text-xs leading-5 text-slate-500">{settings.promptpay_enabled ? promptpayType === 'tax_id' ? 'เลขผู้เสียภาษี 13 หลัก · PromptPay นิติบุคคล' : promptpayType ? 'รูปแบบ PromptPay ถูกต้อง' : 'รองรับเบอร์มือถือ 10 หลัก เลขผู้เสียภาษี 13 หลัก หรือ e-Wallet 15 หลัก' : 'ปิดใช้งาน QR รับเงิน'}</p><p className="border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">ตรวจสอบชื่อผู้รับและยอดเงินในแอปธนาคารก่อนยืนยัน ระบบไม่ตรวจสอบยอดเงินเข้าอัตโนมัติ</p></div></section>
      <section className="grid gap-5 p-5 md:grid-cols-[13rem_minmax(0,1fr)]"><div><h2 className="text-sm font-semibold">การทำงานหน้าร้าน</h2><p className="mt-1 text-xs leading-5 text-slate-500">ควบคุมสิ่งที่แคชเชียร์เห็นและวิธีรับชำระในสาขานี้</p></div><div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-medium text-slate-700">ชื่อจุดขายเริ่มต้น<input value={settings.default_register_name} onChange={(event) => setSettings((current) => ({ ...current, default_register_name: event.target.value }))} className="mt-1.5 h-10 w-full border border-slate-300 px-3 text-sm outline-none focus:border-primary-700" /></label><label className="block text-xs font-medium text-slate-700">ข้อความท้ายใบเสร็จ<textarea value={settings.receipt_footer} onChange={(event) => setSettings((current) => ({ ...current, receipt_footer: event.target.value }))} rows={2} placeholder="เช่น ขอบคุณที่อุดหนุน" className="mt-1.5 w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-700" /></label></div><div className="space-y-2"><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={settings.require_open_register} onChange={(event) => setSettings((current) => ({ ...current, require_open_register: event.target.checked }))} className="h-4 w-4 accent-primary-800" />บังคับเปิดกะก่อนบันทึกขาย</label><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={settings.show_out_of_stock} onChange={(event) => setSettings((current) => ({ ...current, show_out_of_stock: event.target.checked }))} className="h-4 w-4 accent-primary-800" />แสดงสินค้าหมดสต็อกในหน้าขาย</label></div><fieldset><legend className="text-xs font-medium text-slate-700">วิธีรับชำระที่อนุญาต</legend><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">{COMMERCE_PAYMENT_METHODS.map((method) => <label key={method} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.enabled_payment_methods.includes(method)} onChange={() => toggleMethod(method)} className="h-4 w-4 accent-primary-800" />{PAYMENT_METHOD_LABELS[method]}</label>)}</div></fieldset></div></section>
      <div className="flex justify-end p-4"><button disabled={working || !branchId} className="h-10 bg-primary-800 px-5 text-sm font-medium text-white hover:bg-primary-900 disabled:bg-slate-300">{working ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}</button></div>
    </form>
  </main></CommerceShell>;
}
