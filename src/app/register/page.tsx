'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Mail, Lock, Phone, UserRound, Building2, Users, FileText } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input, { TextArea } from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useBranchStore } from '@/store/branchStore';

export default function RegisterPage() {
  const branches = useBranchStore((state) => state.branches);
  const fetchBranches = useBranchStore((state) => state.fetchBranches);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    desired_branch_id: '',
    team_id: '',
    note: '',
  });

  useEffect(() => {
    void fetchBranches();
  }, [fetchBranches]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          desired_branch_id: form.desired_branch_id || null,
          team_id: form.team_id || null,
          note: form.note || null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'ไม่สามารถส่งคำขอสมัครได้');
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch (submitError) {
      console.error(submitError);
      setError('ไม่สามารถส่งคำขอสมัครได้ในขณะนี้');
    }

    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 px-4">
        <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <Image src="/icons/PS.png" alt="PS Rice Logo" width={60} height={60} className="w-14 h-14 rounded-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">ส่งคำขอสมัครเรียบร้อย</h1>
          <p className="text-sm text-slate-500 mt-2">
            ระบบได้สร้างบัญชีไว้ให้แล้ว แต่จะเข้าใช้งานได้หลังผู้จัดการหรือแอดมินอนุมัติ
          </p>
          <Link href="/login" className="block mt-6">
            <Button fullWidth>กลับไปหน้าเข้าสู่ระบบ</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 px-4 py-8">
      <div className="relative w-full max-w-xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white border-2 border-white/20 mb-4 overflow-hidden shadow-xl">
            <Image src="/icons/PS.png" alt="PS Rice Logo" width={80} height={80} className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-white">สมัครใช้งานพนักงาน</h1>
          <p className="text-emerald-100 text-sm mt-1">กรอกข้อมูลเพื่อส่งคำขอสมัครเข้าระบบ</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                id="register-full-name"
                label="ชื่อ-นามสกุล"
                placeholder="เช่น สมชาย ใจดี"
                value={form.full_name}
                onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
                icon={<UserRound className="w-4 h-4" />}
                required
              />
              <Input
                id="register-phone"
                label="เบอร์โทร"
                placeholder="08x-xxx-xxxx"
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                icon={<Phone className="w-4 h-4" />}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                id="register-email"
                type="email"
                label="อีเมล"
                placeholder="example@psrice.co"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                icon={<Mail className="w-4 h-4" />}
                required
              />
              <Input
                id="register-password"
                type="password"
                label="รหัสผ่าน"
                placeholder="อย่างน้อย 8 ตัวอักษร"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                icon={<Lock className="w-4 h-4" />}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="สาขาที่ต้องการสมัคร"
                options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
                placeholder="เลือกสาขา"
                value={form.desired_branch_id}
                onChange={(event) => setForm((current) => ({ ...current, desired_branch_id: event.target.value }))}
              />
              <Input
                id="register-team"
                label="ทีม / กลุ่มงาน"
                placeholder="เช่น ทีมหน้าร้าน"
                value={form.team_id}
                onChange={(event) => setForm((current) => ({ ...current, team_id: event.target.value }))}
                icon={<Users className="w-4 h-4" />}
              />
            </div>

            <TextArea
              id="register-note"
              label="หมายเหตุเพิ่มเติม"
              placeholder="เช่น ตำแหน่งที่สมัคร หรือเวลาทำงานที่สะดวก"
              rows={4}
              value={form.note}
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
            />

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-white border border-slate-200">
                  <FileText className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">หลังส่งคำขอ</p>
                  <p className="text-xs text-slate-500 mt-1">
                    ระบบจะสร้างบัญชีให้ทันทีในสถานะรออนุมัติ เมื่อผู้จัดการอนุมัติแล้วจึงจะเข้าสู่ระบบได้
                  </p>
                </div>
              </div>
            </div>

            <Button type="submit" fullWidth size="lg" loading={loading}>
              ส่งคำขอสมัคร
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-slate-500">
            มีบัญชีอยู่แล้ว?{' '}
            <Link href="/login" className="font-medium text-primary-700 hover:text-primary-800">
              กลับไปเข้าสู่ระบบ
            </Link>
          </div>
        </div>

        <div className="mt-5 text-center text-primary-200 text-xs flex items-center justify-center gap-2">
          <Building2 className="w-3.5 h-3.5" />
          ระบบจะส่งคำขอไปยังผู้จัดการและแอดมินที่เกี่ยวข้องโดยอัตโนมัติ
        </div>
      </div>
    </div>
  );
}
