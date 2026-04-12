"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Mail, Lock } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const success = await login(email, password);
    if (success) {
      const user = useAuthStore.getState().currentUser;
      if (user?.role === "employee") {
        router.push("/employee");
      } else {
        router.push("/manager");
      }
    } else {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือยังไม่ได้สร้างบัญชีในระบบ");
    }
    setLoading(false);
  };



  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 px-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-primary-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-sky-500/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white backdrop-blur-sm border-2 border-white/20 mb-4 overflow-hidden shadow-xl">
             <Image src="/icons/PS.png" alt="PS Rice Logo" width={96} height={96} loading="eager" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-white">PS Rice Wholesale</h1>
          <p className="text-emerald-100 text-sm mt-1 mb-2">ระบบจัดการงานพนักงานระดับองค์กร</p>
        </div>

        {/* Login Form */}
        <div
          className="bg-white rounded-2xl shadow-2xl p-6 animate-fade-in"
          style={{ animationDelay: "0.1s" }}
        >
          <h2 className="text-lg font-semibold text-slate-900 mb-1">
            เข้าสู่ระบบ
          </h2>
          <p className="text-sm text-slate-500 mb-5">
            กรุณากรอกอีเมลและรหัสผ่าน
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              id="login-email"
              type="email"
              label="อีเมล"
              placeholder="example@psrice.co"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail className="w-4 h-4" />}
            />
            <Input
              id="login-password"
              type="password"
              label="รหัสผ่าน"
              placeholder="กรอกรหัสผ่าน"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock className="w-4 h-4" />}
            />

            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <Button
              id="btn-login"
              type="submit"
              fullWidth
              size="lg"
              loading={loading}
            >
              เข้าสู่ระบบ
            </Button>
          </form>
        </div>

        {/* Security Note */}
        <div className="mt-8 text-center animate-fade-in" style={{ animationDelay: "0.2s" }}>
           <p className="text-[11px] text-primary-300/60 uppercase tracking-widest font-bold">
              Secure Enterprise Access
           </p>
           <p className="text-[10px] text-primary-300/40 mt-1">
              Protected by Supabase Identity Management
           </p>
        </div>

        {/* Security note */}
        <p className="text-center text-[11px] text-primary-300/70 mt-6">
          ระบบนี้ใช้การยืนยันตัวตนแบบ Role-Based Access Control
        </p>
      </div>
    </div>
  );
}
