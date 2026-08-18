'use client';

import Select from '@/components/ui/Select';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { CommerceInitialState } from '@/components/commerce/CommerceInitialState';
import { CommerceShell } from '@/components/commerce/CommerceShell';
import { getAccessToken } from '@/lib/supabase';

type Branch = { id: string; name: string };
type Terminal = {
  id: string; code: string; name: string; printer_name: string | null; receipt_width_mm: number;
  cash_drawer_enabled: boolean; local_bridge_enabled: boolean; last_seen_at: string | null; is_active: boolean;
};

async function request(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'ทำรายการไม่สำเร็จ');
  return body;
}

export default function TerminalRegistryWorkspace() {
  const [branchId, setBranchId] = useState('');
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [status, setStatus] = useState('กำลังโหลดทะเบียนเครื่อง POS…');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pairingToken, setPairingToken] = useState('');
  const [bridgeToken, setBridgeToken] = useState('');
  const [scannerValue, setScannerValue] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const scannerRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ code: '', name: '', printer_name: '', receipt_width_mm: 80, cash_drawer_enabled: true, local_bridge_enabled: true });

  const load = useCallback(async (requestedBranchId?: string) => {
    try {
      const context = await request('/api/commerce/context') as { branches: Branch[]; selectedBranchId: string };
      const nextBranchId = requestedBranchId || context.selectedBranchId;
      setBranchId(nextBranchId);
      const response = await request(`/api/commerce/terminals?branch_id=${encodeURIComponent(nextBranchId)}`) as { terminals: Terminal[] };
      setTerminals(response.terminals); setStatus(response.terminals.length ? `${response.terminals.length} จุดขายในสาขานี้` : 'ยังไม่มีเครื่อง POS — เพิ่มเครื่องแรกเพื่อผูกเครื่องพิมพ์และลิ้นชัก');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'โหลดทะเบียนเครื่องไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true); setPairingToken('');
      const response = await request('/api/commerce/terminals', { method: 'POST', body: JSON.stringify({ branch_id: branchId, ...form }) }) as { pairing_token: string };
      setPairingToken(response.pairing_token); setBridgeToken(response.pairing_token);
      setForm((current) => ({ ...current, code: '', name: '', printer_name: '' }));
      await load(branchId); setStatus('เพิ่มเครื่องแล้ว — คัดลอก Pairing token ไปตั้งที่เครื่องนี้ก่อนปิดหน้าต่าง');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'เพิ่มเครื่องไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  const bridgeRequest = async (path: string, body?: object) => {
    try {
      setStatus('กำลังติดต่อ Print Bridge ที่เครื่องนี้…');
      const response = await fetch(`http://127.0.0.1:17333${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-POS-Bridge-Token': bridgeToken }, body: body ? JSON.stringify(body) : undefined });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Print Bridge ไม่ตอบรับ');
      setStatus(path === '/drawer' ? 'ส่งคำสั่งเปิดลิ้นชักแล้ว' : path === '/test-print' ? 'ส่งใบพิมพ์ทดสอบแล้ว' : 'Print Bridge พร้อมใช้งาน');
    } catch (error) { setStatus(`${error instanceof Error ? error.message : 'เชื่อมต่อไม่ได้'} — เปิด scripts/pos-print-bridge.mjs บนเครื่อง POS แล้วลองใหม่`); }
  };

  const saveManagerPin = async (event: FormEvent) => {
    event.preventDefault();
    try { setSaving(true); await request('/api/commerce/manager-pin', { method: 'PUT', body: JSON.stringify({ branch_id: branchId, pin: managerPin }) }); setManagerPin(''); setStatus('ตั้ง Manager PIN สำหรับการอนุมัติหน้า POS แล้ว'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'ตั้ง PIN ไม่สำเร็จ'); } finally { setSaving(false); }
  };

  if (loading) return <CommerceShell section="pos-settings"><main className="mx-auto max-w-[1320px] px-4 py-5"><CommerceInitialState status={status} onRetry={() => void load()} label="กำลังโหลดทะเบียนเครื่อง POS…" /></main></CommerceShell>;
  return <CommerceShell section="pos-settings"><main className="mx-auto max-w-[1320px] px-4 py-5 sm:px-5">
    <header className="border-b border-slate-200 pb-4"><p className="text-xs font-medium text-primary-800">Commerce / Hardware</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">เครื่อง POS และอุปกรณ์</h1><p className="mt-1 text-sm text-slate-500">{status}</p></header>
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
      <section className="border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold">ทะเบียนจุดขาย</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">รหัส</th><th className="px-4 py-3">จุดขาย</th><th className="px-4 py-3">เครื่องพิมพ์</th><th className="px-4 py-3">กระดาษ</th><th className="px-4 py-3">Bridge / ลิ้นชัก</th><th className="px-4 py-3">สถานะ</th></tr></thead><tbody>{terminals.map((terminal) => <tr key={terminal.id} className="border-t border-slate-100"><td className="px-4 py-3 font-mono text-xs font-semibold">{terminal.code}</td><td className="px-4 py-3 font-medium">{terminal.name}</td><td className="px-4 py-3 text-slate-600">{terminal.printer_name || 'ยังไม่ระบุ'}</td><td className="px-4 py-3">{terminal.receipt_width_mm} มม.</td><td className="px-4 py-3 text-xs text-slate-600">{terminal.local_bridge_enabled ? 'Bridge เปิด' : 'Browser print'} · {terminal.cash_drawer_enabled ? 'ลิ้นชักเปิดใช้' : 'ไม่ใช้ลิ้นชัก'}</td><td className="px-4 py-3">{terminal.is_active ? 'พร้อมใช้งาน' : 'ปิดใช้งาน'}</td></tr>)}{!terminals.length ? <tr><td colSpan={6} className="px-4 py-14 text-center text-sm text-slate-500">ยังไม่มีเครื่อง POS ในสาขานี้</td></tr> : null}</tbody></table></div></section>
      <form onSubmit={create} className="border border-slate-200 bg-white p-4"><h2 className="text-sm font-semibold">เพิ่มเครื่อง POS</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><label className="text-xs font-medium">รหัสเครื่อง<input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="เช่น POS-01" className="mt-1 h-10 w-full border border-slate-300 px-3 text-sm" /></label><label className="text-xs font-medium">ชื่อจุดขาย<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="เคาน์เตอร์ 1" className="mt-1 h-10 w-full border border-slate-300 px-3 text-sm" /></label><label className="text-xs font-medium">ชื่อ Printer ในระบบ<input value={form.printer_name} onChange={(event) => setForm({ ...form, printer_name: event.target.value })} placeholder="EPSON-TM-T82" className="mt-1 h-10 w-full border border-slate-300 px-3 text-sm" /></label><label className="text-xs font-medium">หน้ากว้างกระดาษ<Select value={form.receipt_width_mm} onChange={(event) => setForm({ ...form, receipt_width_mm: Number(event.target.value) })} className="mt-1 h-10 w-full border border-slate-300 bg-white px-3 text-sm"><option value="80">80 มม.</option><option value="58">58 มม.</option></Select></label></div><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.local_bridge_enabled} onChange={(event) => setForm({ ...form, local_bridge_enabled: event.target.checked })} className="accent-primary-800" />ใช้ Local Print Bridge</label><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.cash_drawer_enabled} onChange={(event) => setForm({ ...form, cash_drawer_enabled: event.target.checked })} className="accent-primary-800" />เปิดลิ้นชักหลังรับเงินสด</label><button disabled={saving} className="mt-4 h-10 w-full bg-primary-800 text-sm font-semibold text-white disabled:bg-slate-300">{saving ? 'กำลังเพิ่ม…' : 'เพิ่มและสร้าง Pairing token'}</button>{pairingToken ? <div className="mt-4 border border-amber-300 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-900">แสดงครั้งเดียว — คัดลอกเก็บบนเครื่อง POS</p><code className="mt-2 block break-all text-xs text-amber-950">{pairingToken}</code></div> : null}</form>
    </div>
    <section className="mt-5 border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold">ทดสอบอุปกรณ์บนเครื่องนี้</h2><p className="mt-1 text-xs text-slate-500">Bridge รับคำสั่งเฉพาะ 127.0.0.1 และต้องมี token ตรงกับเครื่อง</p></div><div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]"><input type="password" value={bridgeToken} onChange={(event) => setBridgeToken(event.target.value)} placeholder="Pairing token ของเครื่องนี้" className="h-10 border border-slate-300 px-3 text-sm" /><button type="button" onClick={() => void bridgeRequest('/health')} className="h-10 border border-slate-300 px-4 text-sm font-medium">ตรวจ Bridge</button><button type="button" onClick={() => void bridgeRequest('/test-print', { printer: terminals[0]?.printer_name })} className="h-10 border border-slate-300 px-4 text-sm font-medium">ทดสอบพิมพ์</button><button type="button" onClick={() => void bridgeRequest('/drawer', { printer: terminals[0]?.printer_name })} className="h-10 border border-slate-300 px-4 text-sm font-medium">ทดสอบลิ้นชัก</button></div><div className="grid gap-4 border-t border-slate-100 p-4 md:grid-cols-2"><label className="text-xs font-medium">ทดสอบ Barcode scanner (ยิงบาร์โค้ดแล้วกด Enter)<input ref={scannerRef} value={scannerValue} onChange={(event) => setScannerValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); setStatus(`Scanner อ่านค่าได้: ${scannerValue}`); setScannerValue(''); } }} onFocus={() => setStatus('พร้อมรับข้อมูลจาก scanner…')} className="mt-1.5 h-10 w-full border border-slate-300 px-3 font-mono text-sm" placeholder="คลิกครั้งเดียวเพื่อทดสอบ" /></label><form onSubmit={saveManagerPin}><label className="text-xs font-medium">Manager PIN สำหรับอนุมัติหน้า POS<span className="mt-1.5 flex"><input required pattern="[0-9]{4,8}" type="password" inputMode="numeric" value={managerPin} onChange={(event) => setManagerPin(event.target.value)} className="h-10 min-w-0 flex-1 border border-slate-300 px-3 text-sm" placeholder="ตัวเลข 4–8 หลัก"/><button disabled={saving} className="h-10 bg-slate-900 px-4 text-xs font-semibold text-white">ตั้ง PIN</button></span></label></form></div></section>
  </main></CommerceShell>;
}
