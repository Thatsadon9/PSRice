'use client';

import Select from '@/components/ui/Select';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CommerceShell } from '@/components/commerce/CommerceShell';
import { CommerceInitialState } from '@/components/commerce/CommerceInitialState';
import { getAccessToken } from '@/lib/supabase';

type Role = { id: string; code: string; name: string; description: string | null };
type Person = { id: string; full_name: string; email: string; role: string; branch_id: string | null };
type Branch = { id: string; name: string };
type Assignment = { id: string; user_id: string; role_id: string; branch_id: string | null; valid_from: string; valid_until: string | null };
type AccessData = { roles: Role[]; users: Person[]; branches: Branch[]; assignments: Assignment[] };

async function commerceFetch(path: string, init?: RequestInit) {
  const accessToken = await getAccessToken();
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'ทำรายการไม่สำเร็จ');
  return body;
}

export default function CommerceAccessWorkspace() {
  const [data, setData] = useState<AccessData | null>(null);
  const [userId, setUserId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState('กำลังโหลดสิทธิ์ Commerce…');
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await commerceFetch('/api/commerce/access') as AccessData;
      setData(response);
      setUserId((current) => current || response.users[0]?.id || '');
      setRoleId((current) => current || response.roles.find((role) => role.code !== 'commerce_owner')?.id || '');
      setStatus(`${response.assignments.length} รายการสิทธิ์`);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'โหลดสิทธิ์ไม่สำเร็จ'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const selectedRole = data?.roles.find((role) => role.id === roleId);
  const needsBranch = selectedRole?.code !== 'commerce_owner';
  useEffect(() => { if (!needsBranch) setBranchId(''); }, [needsBranch]);

  const assign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setWorking(true);
      await commerceFetch('/api/commerce/access', { method: 'POST', body: JSON.stringify({ user_id: userId, role_id: roleId, branch_id: branchId || null }) });
      await load(); setStatus('มอบสิทธิ์แล้ว');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'มอบสิทธิ์ไม่สำเร็จ'); } finally { setWorking(false); }
  };
  const remove = async (assignmentId: string) => {
    try { setWorking(true); await commerceFetch(`/api/commerce/access?assignment_id=${encodeURIComponent(assignmentId)}`, { method: 'DELETE' }); await load(); setStatus('ถอนสิทธิ์แล้ว'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'ถอนสิทธิ์ไม่สำเร็จ'); } finally { setWorking(false); }
  };

  const byUser = useMemo(() => new Map(data?.users.map((user) => [user.id, user]) || []), [data?.users]);
  const byRole = useMemo(() => new Map(data?.roles.map((role) => [role.id, role]) || []), [data?.roles]);
  const byBranch = useMemo(() => new Map(data?.branches.map((branch) => [branch.id, branch]) || []), [data?.branches]);

  if (!data) return <CommerceShell section="backoffice"><main className="mx-auto max-w-[1320px] px-4 py-5"><CommerceInitialState status={status} onRetry={() => void load()} label="กำลังโหลดสิทธิ์ Commerce…" /></main></CommerceShell>;

  return <CommerceShell section="backoffice"><main className="mx-auto max-w-[1320px] px-4 py-5">
    <header className="border-b border-slate-200 pb-4"><p className="text-xs font-medium text-primary-800">Commerce / Settings</p><h1 className="mt-1 text-2xl font-semibold">สิทธิ์การใช้งาน Commerce</h1><p className="mt-1 text-sm text-slate-500">{status}</p></header>
    <div className="mt-5 grid gap-5 lg:grid-cols-[23rem_1fr]"><section className="h-fit border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold">มอบ role ให้ผู้ใช้</h2><p className="mt-1 text-xs leading-5 text-slate-500">Role ที่ไม่ใช่เจ้าของระบบต้องระบุสาขา เพื่อป้องกันสิทธิ์ข้ามสาขาโดยไม่ตั้งใจ</p></div><form onSubmit={assign} className="space-y-4 p-4"><label className="block text-xs font-medium">ผู้ใช้<Select required value={userId} onChange={(event) => setUserId(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-2 text-sm">{data?.users.map((user) => <option key={user.id} value={user.id}>{user.full_name} · {user.email}</option>)}</Select></label><label className="block text-xs font-medium">Role<Select required value={roleId} onChange={(event) => setRoleId(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-2 text-sm">{data?.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</Select><span className="mt-1 block font-normal text-slate-500">{selectedRole?.description}</span></label>{needsBranch && <label className="block text-xs font-medium">สาขา<Select required value={branchId} onChange={(event) => setBranchId(event.target.value)} className="mt-1.5 h-10 w-full border border-slate-300 bg-white px-2 text-sm"><option value="">เลือกสาขา</option>{data?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></label>}<button disabled={working || !userId || !roleId || (needsBranch && !branchId)} className="h-10 w-full bg-primary-800 text-sm font-medium text-white disabled:bg-slate-300">{working ? 'กำลังบันทึก…' : 'มอบสิทธิ์'}</button></form></section>
    <section className="border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold">สิทธิ์ที่มอบแล้ว</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">ผู้ใช้</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">ขอบเขต</th><th className="px-4 py-3">เริ่มมีผล</th><th className="px-4 py-3" /></tr></thead><tbody>{data?.assignments.map((assignment) => <tr key={assignment.id} className="border-t border-slate-100"><td className="px-4 py-3"><p className="font-medium">{byUser.get(assignment.user_id)?.full_name || 'ผู้ใช้ที่ถูกลบ'}</p><p className="mt-0.5 text-xs text-slate-500">{byUser.get(assignment.user_id)?.email}</p></td><td className="px-4 py-3">{byRole.get(assignment.role_id)?.name || '-'}</td><td className="px-4 py-3">{assignment.branch_id ? byBranch.get(assignment.branch_id)?.name || '-' : 'ทุกสาขา'}</td><td className="px-4 py-3 text-slate-500">{new Date(assignment.valid_from).toLocaleDateString('th-TH')}</td><td className="px-4 py-3 text-right"><button type="button" disabled={working} onClick={() => void remove(assignment.id)} className="text-xs text-red-700 hover:underline disabled:text-slate-300">ถอนสิทธิ์</button></td></tr>)}{!data?.assignments.length && <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">ยังไม่มี role ที่มอบให้ผู้ใช้</td></tr>}</tbody></table></div></section></div>
  </main></CommerceShell>;
}
