'use client';

import Link from 'next/link';
import Card from '@/components/ui/Card';
import { 
  BarChart3, Settings, CalendarCheck, Building2, 
  Users, FileText, CheckSquare, Clock, ArrowRight,
  LogOut, Shield, Code
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';

export default function ManagerMorePage() {
  const { logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const menuItems = [
    { label: 'มอบหมายงาน', href: '/manager/assignments', icon: <CalendarCheck className="w-5 h-5" />, color: 'bg-blue-50 text-blue-600' },
    { label: 'ต้นแบบงาน', href: '/manager/templates', icon: <FileText className="w-5 h-5" />, color: 'bg-primary-50 text-primary-600' },
    { label: 'จัดการสาขา', href: '/manager/branches', icon: <Building2 className="w-5 h-5" />, color: 'bg-indigo-50 text-indigo-600' },
    { label: 'จัดการพนักงาน', href: '/manager/employees', icon: <Users className="w-5 h-5" />, color: 'bg-sky-50 text-sky-600' },
    { label: 'รายงานและสถิติ', href: '/manager/reports', icon: <BarChart3 className="w-5 h-5" />, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'การเข้างานวันนี้', href: '/manager/attendance', icon: <Clock className="w-5 h-5" />, color: 'bg-amber-50 text-amber-600' },
    { label: 'ตั้งค่าระบบ', href: '/manager/settings', icon: <Settings className="w-5 h-5" />, color: 'bg-slate-100 text-slate-600' },
  ];

  return (
    <div className="px-4 py-4 space-y-6 animate-fade-in">
      <h1 className="text-xl font-bold text-slate-900">เมนูจัดการ</h1>

      <div className="grid grid-cols-1 gap-3">
        {menuItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card interactive className="flex items-center gap-4 py-3 px-4 h-full">
              <div className={`p-2 rounded-lg ${item.color}`}>
                {item.icon}
              </div>
              <span className="flex-1 font-semibold text-slate-900">{item.label}</span>
              <ArrowRight className="w-4 h-4 text-slate-300" />
            </Card>
          </Link>
        ))}
      </div>

      <div className="pt-4 border-t border-slate-200">
         <button 
           onClick={handleLogout}
           className="w-full flex items-center gap-4 py-3 px-4 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
         >
           <div className="p-2 rounded-lg bg-red-100">
             <LogOut className="w-5 h-5 text-red-600" />
           </div>
           <span className="font-bold">ออกจากระบบ</span>
         </button>
      </div>

      <div className="text-center py-4">
         <p className="text-xs text-slate-400">PS Rice Manager v1.0.0</p>
         <div className="flex justify-center gap-4 mt-2">
            <Shield className="w-4 h-4 text-slate-300" />
            <Code className="w-4 h-4 text-slate-300" />
         </div>
      </div>
    </div>
  );
}
