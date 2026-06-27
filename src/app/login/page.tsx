"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, AlertCircle } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authAlert, setAuthAlert] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthAlert(null);
    setLoading(true);

    const result = await login(email, password);

    if (result.success) {
      const user = useAuthStore.getState().currentUser;
      router.push(user?.role === "employee" ? "/employee" : "/manager");
    } else {
      setAuthAlert(result.message || "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-primary-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-sky-500/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white backdrop-blur-sm border-2 border-white/20 mb-4 overflow-hidden shadow-xl">
            <Image
              src="/icons/PS.png"
              alt="PS Rice Logo"
              width={96}
              height={96}
              loading="eager"
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-2xl font-bold text-white">PS Rice Wholesale</h1>
          <p className="text-emerald-100 text-sm mt-1 mb-2">ระบบจัดการงานพนักงานระดับองค์กร</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">เข้าสู่ระบบ</h2>
          <p className="text-sm text-slate-500 mb-5">กรุณากรอกอีเมลและรหัสผ่าน</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              id="login-email"
              type="email"
              label="อีเมล"
              placeholder="example@psrice.co"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              icon={<Mail className="w-4 h-4" />}
            />
            <div>
              <Input
                id="login-password"
                type="password"
                label="รหัสผ่าน"
                placeholder="กรอกรหัสผ่าน"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                icon={<Lock className="w-4 h-4" />}
              />
              <div className="flex justify-end mt-2">
                <button 
                  type="button" 
                  onClick={() => setShowForgotModal(true)} 
                  className="text-xs font-bold text-primary-600 hover:text-primary-700 transition-colors"
                >
                  ลืมรหัสผ่าน?
                </button>
              </div>
            </div>

            <Button id="btn-login" type="submit" fullWidth size="lg" loading={loading}>
              เข้าสู่ระบบ
            </Button>
          </form>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-900">ยังไม่มีบัญชีพนักงาน?</p>
            <p className="text-xs text-slate-500 mt-1">
              สมัครด้วยตัวเองและรอผู้จัดการหรือแอดมินอนุมัติก่อนเริ่มใช้งาน
            </p>
            <Link href="/register" className="block mt-3">
              <Button variant="outline" fullWidth>
                สมัครใช้งาน
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-8 text-center animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <p className="text-[11px] text-primary-300/60 uppercase tracking-widest font-bold">
            Secure Enterprise Access
          </p>
          <p className="text-[10px] text-primary-300/40 mt-1">
            Protected by Supabase Identity Management
          </p>
        </div>

        <p className="text-center text-[11px] text-primary-300/70 mt-6">
          ระบบนี้ใช้การยืนยันตัวตนแบบ Role-Based Access Control
        </p>
      </div>

      <Modal
        isOpen={!!authAlert}
        onClose={() => setAuthAlert(null)}
        title="เข้าสู่ระบบไม่สำเร็จ"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <AlertCircle className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-sm text-slate-700 pt-2">{authAlert}</p>
          </div>
          <Button fullWidth type="button" onClick={() => setAuthAlert(null)}>
            ตกลง
          </Button>
        </div>
      </Modal>

      <Modal isOpen={showForgotModal} onClose={() => setShowForgotModal(false)} title="ลืมรหัสผ่าน">
        <div className="space-y-4 py-4 text-center">
          <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 mb-2">
            <Lock className="w-8 h-8" />
          </div>
          <p className="text-slate-700 text-sm leading-relaxed">
            หากคุณลืมรหัสผ่าน หรือไม่สามารถเข้าสู่ระบบได้<br />กรุณาติดต่อ <strong className="text-primary-700">ผู้จัดการสาขา</strong> ของคุณเพื่อทำการรีเซ็ตรหัสผ่านใหม่
          </p>
          <Button fullWidth onClick={() => setShowForgotModal(false)} className="mt-4">เข้าใจแล้ว</Button>
        </div>
      </Modal>
    </div>
  );
}
