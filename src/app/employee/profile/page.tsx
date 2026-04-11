'use client';

import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { UserCircle, MapPin, Building2, LogOut, Settings, Bell, Shield, ChevronRight } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants';

export default function ProfilePage() {
  const { currentUser, logout } = useAuthStore();
  const branchStore = useBranchStore();
  const router = useRouter();

  if (!currentUser) return null;
  const branch = branchStore.getBranchById(currentUser.branch_id);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <div className="px-4 py-4 space-y-4 animate-fade-in pb-24">
      <h1 className="text-lg font-bold text-slate-900">โปรไฟล์</h1>

      <Card className="text-center py-6">
        <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
           <UserCircle className="w-12 h-12 text-primary-600" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">{currentUser.full_name}</h2>
        <p className="text-sm text-slate-500 mb-1">{ROLE_LABELS[currentUser.role]}</p>
        <div className="flex justify-center items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full w-fit mx-auto mt-2">
           <Building2 className="w-3.5 h-3.5" />
           {branch?.name}
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
         <div className="divide-y divide-slate-100">
            <div className="p-4 flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-50 rounded-lg"><MapPin className="w-5 h-5 text-slate-600" /></div>
                  <div>
                     <p className="text-xs text-slate-500">สาขาที่สังกัด</p>
                     <p className="text-sm font-medium text-slate-900">{branch?.name}</p>
                  </div>
               </div>
            </div>
            <div className="p-4 flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-50 rounded-lg"><Shield className="w-5 h-5 text-slate-600" /></div>
                  <div>
                     <p className="text-xs text-slate-500">ทีม</p>
                     <p className="text-sm font-medium text-slate-900">{currentUser.team_id}</p>
                  </div>
               </div>
            </div>
         </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
         <div className="divide-y divide-slate-100">
            <button 
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              onClick={() => router.push('/employee/notifications')}
            >
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary-50 rounded-lg"><Bell className="w-5 h-5 text-primary-600" /></div>
                  <span className="text-sm font-medium text-slate-900">การแจ้งเตือน</span>
               </div>
               <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
            <button 
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              onClick={() => router.push('/employee/settings')}
            >
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary-50 rounded-lg"><Settings className="w-5 h-5 text-primary-600" /></div>
                  <span className="text-sm font-medium text-slate-900">การตั้งค่าแอป</span>
               </div>
               <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
         </div>
      </Card>

      <Button variant="danger" fullWidth onClick={handleLogout} icon={<LogOut className="w-4 h-4" />} className="mt-4">
        ออกจากระบบ
      </Button>
    </div>
  );
}
