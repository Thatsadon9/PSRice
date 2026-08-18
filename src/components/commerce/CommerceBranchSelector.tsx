'use client';

import Select from '@/components/ui/Select';

import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { clearCommerceContextCache } from '@/components/commerce/CommerceShell';
import { getAccessToken } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

type Branch = { id: string; name: string; code: string | null };
type Terminal = { id: string; name: string; code: string };
type ContextResponse = {
  branches: Branch[];
  terminals: Terminal[];
  selectedBranchId: string | null;
  selectedTerminalId: string | null;
  suggestedBranchId: string | null;
};

async function request(path: string, init?: RequestInit) {
  const accessToken = await getAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || 'ทำรายการไม่สำเร็จ'), { status: response.status, body });
  return body;
}

export default function CommerceBranchSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const currentUser = useAuthStore((state) => state.currentUser);
  const [data, setData] = useState<ContextResponse | null>(null);
  const [branchId, setBranchId] = useState('');
  const [terminalId, setTerminalId] = useState('');
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [status, setStatus] = useState('กำลังเตรียมรายชื่อสาขา…');
  const [saving, setSaving] = useState(false);
  const nextPath = useMemo(() => {
    const requested = searchParams.get('next');
    return requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/pos';
  }, [searchParams]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void request('/api/commerce/context')
      .then((response: ContextResponse) => {
        setData(response);
        const initialBranch = response.selectedBranchId || response.suggestedBranchId || response.branches[0]?.id || '';
        setBranchId(initialBranch);
        setTerminalId(response.selectedTerminalId || '');
        if (initialBranch === response.selectedBranchId) setTerminals(response.terminals || []);
        setStatus(response.branches.length ? 'เลือกสาขาที่จะเริ่มทำงานวันนี้' : 'บัญชีนี้ยังไม่ได้รับสิทธิ์ Commerce ในสาขาใด');
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : 'โหลดสาขาไม่สำเร็จ'));
  }, [isAuthenticated]);

  useEffect(() => {
    if (!branchId || branchId === data?.selectedBranchId) return;
    setTerminalId('');
    void request(`/api/commerce/terminals?branch_id=${encodeURIComponent(branchId)}`)
      .then((response: { terminals: Terminal[] }) => setTerminals(response.terminals))
      .catch(() => setTerminals([]));
  }, [branchId, data?.selectedBranchId]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!branchId) return;
    try {
      setSaving(true);
      await request('/api/commerce/context', { method: 'PUT', body: JSON.stringify({ branch_id: branchId, terminal_id: terminalId || null }) });
      clearCommerceContextCache();
      router.replace(nextPath);
    } catch (error) {
      const issue = error as Error & { status?: number; body?: { requires_confirmation?: boolean; open_registers?: number; held_sales?: number } };
      if (issue.status === 409 && issue.body?.requires_confirmation) {
        const confirmed = window.confirm(`สาขาเดิมยังมีกะเปิด ${issue.body.open_registers || 0} กะ และบิลพัก ${issue.body.held_sales || 0} บิล\n\nหากเปลี่ยนสาขา งานเดิมจะยังคงอยู่และต้องกลับมาจัดการภายหลัง ต้องการเปลี่ยนต่อหรือไม่?`);
        if (confirmed) {
          await request('/api/commerce/context', { method: 'PUT', body: JSON.stringify({ branch_id: branchId, terminal_id: terminalId || null, force: true }) });
          clearCommerceContextCache();
          router.replace(nextPath);
          return;
        }
      }
      setStatus(issue.message);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !currentUser || !data) {
    return <main className="grid min-h-dvh place-items-center bg-[#f3f4f2]"><p className="text-sm text-slate-500">{status}</p></main>;
  }

  return (
    <main className="min-h-dvh bg-[#f3f4f2] px-4 py-8 text-slate-900 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between border-b border-slate-300 pb-5">
          <div className="flex items-center gap-3">
            <Image src="/icons/PS.png" alt="PS Rice" width={42} height={42} className="h-10 w-10 rounded-md object-cover" priority />
            <div><p className="text-sm font-semibold">PS Rice Commerce</p><p className="text-xs text-slate-500">เข้าสู่พื้นที่ขายและบริหารสต๊อก</p></div>
          </div>
          <p className="text-sm text-slate-600">{currentUser.full_name}</p>
        </header>

        <div className="grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-800">เริ่มงาน</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">เลือกสาขา / ร้านค้า</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">สาขาสำหรับรอบการใช้งานนี้</p>
            <div className="mt-7 divide-y divide-slate-200 border-y border-slate-300 bg-white">
              {data.branches.map((branch, index) => (
                <label key={branch.id} className={`flex cursor-pointer items-center gap-4 px-4 py-4 transition hover:bg-slate-50 ${branchId === branch.id ? 'bg-primary-50' : ''}`}>
                  <input type="radio" name="branch" value={branch.id} checked={branchId === branch.id} onChange={() => setBranchId(branch.id)} className="h-4 w-4 accent-primary-800" />
                  <span className="w-8 text-sm tabular-nums text-slate-400">{String(index + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1"><span className="block font-medium">{branch.name}</span><span className="mt-0.5 block text-xs text-slate-500">รหัสสาขา {branch.code || 'ยังไม่กำหนด'}</span></span>
                  <span className="text-xs font-medium text-primary-800">{branchId === branch.id ? 'เลือกแล้ว' : 'เลือก'}</span>
                </label>
              ))}
            </div>
          </section>

          <form onSubmit={save} className="self-start border-t-4 border-primary-800 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
            <h2 className="text-base font-semibold">ยืนยันจุดทำงาน</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">กำหนดเลขที่ใบเสร็จ เครื่องพิมพ์ และลิ้นชักเงิน</p>
            <label className="mt-5 block text-xs font-medium text-slate-700">เครื่อง / จุดขาย
              <Select value={terminalId} onChange={(event) => setTerminalId(event.target.value)} className="mt-1.5 h-11 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-700">
                <option value="">ยังไม่ระบุเครื่อง</option>
                {terminals.map((terminal) => <option key={terminal.id} value={terminal.id}>{terminal.code} — {terminal.name}</option>)}
              </Select>
            </label>
            <button disabled={saving || !branchId} className="mt-5 h-11 w-full bg-primary-800 px-4 text-sm font-semibold text-white transition hover:bg-primary-900 disabled:bg-slate-300">{saving ? 'กำลังเข้าสู่สาขา…' : 'เข้าสู่ระบบ Commerce'}</button>
            <p aria-live="polite" className="mt-4 text-xs leading-5 text-slate-500">{status}</p>
          </form>
        </div>
      </div>
    </main>
  );
}
