'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  Bell,
  ChevronRight,
  Globe,
  LogOut,
  Shield,
  Smartphone,
  User,
} from 'lucide-react';
import AdminViewModeSwitch from '@/components/layout/AdminViewModeSwitch';
import Card from '@/components/ui/Card';
import { Page, PageHeader } from '@/components/ui/Page';
import { useAuthStore } from '@/store/authStore';

interface SettingsItem {
  icon: ReactNode;
  label: string;
  description?: string;
  href?: string;
  action: ReactNode;
}

interface SettingsSection {
  title: string;
  items: SettingsItem[];
}

export default function SettingsPage() {
  const { currentUser, logout } = useAuthStore();
  const router = useRouter();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  if (!currentUser) {
    return null;
  }

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const sections: SettingsSection[] = [
    {
      title: 'แอปพลิเคชัน',
      items: [
        {
          icon: <Bell className="h-5 w-5 text-blue-500" />,
          label: 'การแจ้งเตือน',
          description: 'เปิด-ปิดการแจ้งเตือนในแอป',
          action: (
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={() => setNotificationsEnabled((prev) => !prev)}
              className="h-5 w-5 rounded text-primary-600 focus:ring-primary-500"
            />
          ),
        },
        {
          icon: <Smartphone className="h-5 w-5 text-emerald-500" />,
          label: 'ติดตั้งบนมือถือ (PWA)',
          description: 'เพิ่มความคล่องตัวในการใช้งาน',
          action: <ChevronRight className="h-4 w-4 text-slate-300" />,
        },
        {
          icon: <Globe className="h-5 w-5 text-amber-500" />,
          label: 'ภาษา (Language)',
          description: 'ภาษาไทย (Thai)',
          action: <ChevronRight className="h-4 w-4 text-slate-300" />,
        },
      ],
    },
    {
      title: 'ความปลอดภัย',
      items: [
        {
          icon: <User className="h-5 w-5 text-indigo-500" />,
          label: 'ข้อมูลส่วนตัว',
          href: '/employee/profile',
          action: <ChevronRight className="h-4 w-4 text-slate-300" />,
        },
        {
          icon: <Shield className="h-5 w-5 text-red-500" />,
          label: 'เปลี่ยนรหัสผ่าน',
          href: '/employee/profile#security',
          action: <ChevronRight className="h-4 w-4 text-slate-300" />,
        },
      ],
    },
  ];

  return (
    <Page maxWidth="sm" className="space-y-5 pb-24">
      <PageHeader
        title="เพิ่มเติม"
        description="ตั้งค่าแอป บัญชี และเมนูรอง"
      />

      <AdminViewModeSwitch variant="card" />

      <div className="space-y-5">
        {sections.map((section) => (
          <div key={section.title} className="space-y-3">
            <h2 className="px-1 text-sm font-semibold text-slate-950">
              {section.title}
            </h2>
            <Card padding="none" className="overflow-hidden">
              <div className="divide-y divide-slate-50">
                {section.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex min-w-0 cursor-pointer items-center justify-between gap-3 bg-white p-4 transition-colors hover:bg-slate-50"
                    onClick={() => item.href && router.push(item.href)}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="shrink-0 rounded-xl border border-slate-100 bg-slate-50 p-2.5 shadow-xs">
                        {item.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">{item.label}</p>
                        {item.description && (
                          <p className="text-[10px] font-medium text-slate-500">{item.description}</p>
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
            onClick={() => {
              void handleLogout();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-600 transition-colors hover:bg-red-100"
          >
            <LogOut className="h-4 w-4" /> ออกจากระบบ
          </button>
          <p className="mt-6 text-center text-[10px] font-medium text-slate-400">
            Version 1.2.0 Build (Beta)
          </p>
        </div>
      </div>
    </Page>
  );
}
