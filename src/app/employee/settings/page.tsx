'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { 
  ArrowLeft, Bell, Smartphone, Globe, Shield, 
  Moon, Sun, LogOut, ChevronRight, User
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const { currentUser, logout } = useAuthStore();
  const router = useRouter();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  if (!currentUser) return null;

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const sections = [
    {
      title: 'แอปพลิเคชัน',
      items: [
        { 
          icon: <Bell className="w-5 h-5 text-blue-500" />, 
          label: 'การแจ้งเตือน', 
          description: 'เปิด-ปิดการแจ้งเตือนในแอป',
          action: (
            <input 
              type="checkbox" 
              checked={notificationsEnabled} 
              onChange={() => setNotificationsEnabled(!notificationsEnabled)}
              className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500" 
            />
          )
        },
        { 
          icon: <Smartphone className="w-5 h-5 text-emerald-500" />, 
          label: 'ติดตั้งบนมือถือ (PWA)', 
          description: 'เพิ่มความคล่องตัวในการใช้งาน',
          action: <ChevronRight className="w-4 h-4 text-slate-300" />
        },
        { 
          icon: <Globe className="w-5 h-5 text-amber-500" />, 
          label: 'ภาษา (Language)', 
          description: 'ภาษาไทย (Thai)',
          action: <ChevronRight className="w-4 h-4 text-slate-300" />
        },
      ]
    },
    {
      title: 'ความปลอดภัย',
      items: [
        { 
          icon: <User className="w-5 h-5 text-indigo-500" />, 
          label: 'ข้อมูลส่วนตัว', 
          href: '/employee/profile',
          action: <ChevronRight className="w-4 h-4 text-slate-300" />
        },
        { 
          icon: <Shield className="w-5 h-5 text-red-500" />, 
          label: 'เปลี่ยนรหัสผ่าน', 
          action: <ChevronRight className="w-4 h-4 text-slate-300" />
        },
      ]
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in px-4 py-6 pb-24">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/employee" className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-slate-900">การตั้งค่า</h1>
      </div>

      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.title} className="space-y-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">
              {section.title}
            </h2>
            <Card padding="none" className="overflow-hidden border-slate-100 shadow-sm">
              <div className="divide-y divide-slate-50">
                {section.items.map((item: any, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center justify-between p-4 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => item.href && router.push(item.href)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 shadow-xs shrink-0">
                        {item.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">{item.label}</p>
                        {item.description && (
                          <p className="text-[10px] text-slate-500 font-medium">{item.description}</p>
                        )}
                      </div>
                    </div>
                    {item.action}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ))}
        
        <div className="pt-4">
           <button 
             onClick={handleLogout}
             className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-red-50 text-red-600 font-bold text-sm border border-red-100 hover:bg-red-100 transition-all active:scale-[0.98]"
           >
             <LogOut className="w-4 h-4" /> ออกจากระบบ
           </button>
           <p className="text-center text-[10px] text-slate-400 mt-6 font-medium">
              Version 1.2.0 Build (Beta)
           </p>
        </div>
      </div>
    </div>
  );
}
