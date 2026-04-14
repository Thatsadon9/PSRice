'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useHrStore } from '@/store/hrStore';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { UserCircle, MapPin, Building2, LogOut, Settings, Bell, Shield, ChevronRight, Camera, ReceiptText, CalendarDays } from 'lucide-react';
import { ROLE_LABELS, SHIFT_ASSIGNMENT_STATUS_LABELS } from '@/lib/constants';
import { uploadFile } from '@/lib/storage';
import { getCurrentDateStr } from '@/lib/dateUtils';
import { resolveShiftForUserDate } from '@/lib/hr';

export default function ProfilePage() {
  const { currentUser, logout, initialize } = useAuthStore();
  const branchStore = useBranchStore();
  const employeeStore = useEmployeeStore();
  const hrStore = useHrStore();
  const branchPolicies = hrStore.branchPolicies;
  const shiftAssignments = hrStore.shiftAssignments;
  const router = useRouter();

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!currentUser) return null;
  const branch = branchStore.getBranchById(currentUser.branch_id);
  const todayShift = resolveShiftForUserDate({
    user: currentUser,
    workDate: getCurrentDateStr(),
    assignments: shiftAssignments,
    branchPolicies,
  });

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const fileName = `${currentUser.id}/${Date.now()}.jpg`;
    
    // Upload file to avatars bucket
    const url = await uploadFile('avatars', fileName, file);
    if (url) {
      // Update the user's database record
      await employeeStore.updateUser(currentUser.id, { avatar_url: url });
      // Re-initialize to pick up the updated currentUser.avatar_url
      await initialize();
    }
    setUploading(false);
    e.target.value = '';
  };

  return (
    <div className="px-4 py-4 space-y-4 animate-fade-in pb-24">
      <h1 className="text-lg font-bold text-slate-900">โปรไฟล์</h1>

      <Card className="text-center py-6">
        <div className="relative w-24 h-24 mx-auto mb-4 group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
           {currentUser.avatar_url ? (
             <img src={currentUser.avatar_url} alt="Profile" className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-sm" />
           ) : (
             <div className="w-24 h-24 bg-primary-100 rounded-full flex items-center justify-center border-4 border-white shadow-sm">
                <UserCircle className="w-14 h-14 text-primary-600" />
             </div>
           )}
           <div className={`absolute inset-0 bg-black/40 rounded-full flex items-center justify-center transition-opacity ${uploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
              <Camera className={`w-6 h-6 text-white ${uploading ? 'animate-pulse' : ''}`} />
           </div>
        </div>
        <input 
          type="file" 
          accept="image/*" 
          className="hidden" 
          ref={fileInputRef}
          onChange={handleFileChange}
          disabled={uploading}
        />
        <h2 className="text-lg font-semibold text-slate-900">{currentUser.full_name}</h2>
        <p className="text-sm text-slate-500 mb-1">{ROLE_LABELS[currentUser.role]}</p>
        <div className="flex justify-center items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full w-fit mx-auto mt-2">
           <Building2 className="w-3.5 h-3.5" />
           {branch?.name}
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden shadow-sm border-slate-100">
         <div className="p-4 bg-slate-50 border-b border-slate-100">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">ข้อมูลการจ้างงาน</h3>
         </div>
         <div className="divide-y divide-slate-100">
            <div className="p-4 flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg border border-slate-100"><MapPin className="w-5 h-5 text-slate-600" /></div>
                  <div>
                     <p className="text-[10px] font-black text-slate-400 uppercase">สาขาที่สังกัด</p>
                     <p className="text-sm font-bold text-slate-900">{branch?.name || 'ไม่ได้ระบุ'}</p>
                  </div>
               </div>
            </div>
            <div className="p-4 flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg border border-slate-100"><Shield className="w-5 h-5 text-slate-600" /></div>
                  <div>
                     <p className="text-[10px] font-black text-slate-400 uppercase">ทีม / แผนก</p>
                     <p className="text-sm font-bold text-slate-900">{currentUser.team_id || 'ทั่วไป'}</p>
                  </div>
               </div>
            </div>
            {hrStore.getCompensationProfile(currentUser.id) && (
              <div className="p-4 flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg border border-slate-100"><ReceiptText className="w-5 h-5 text-slate-600" /></div>
                    <div>
                       <p className="text-[10px] font-black text-slate-400 uppercase">รูปแบบรายได้</p>
                       <p className="text-sm font-bold text-slate-900">
                         {hrStore.getCompensationProfile(currentUser.id)?.pay_type === 'daily' ? 'รายวัน' : 
                          hrStore.getCompensationProfile(currentUser.id)?.pay_type === 'hourly' ? 'รายชั่วโมง' : 'รายเดือน'}
                       </p>
                    </div>
                 </div>
              </div>
            )}
         </div>
      </Card>

      <Card className="border-slate-100">
         <div className="flex items-start gap-3">
            <div className="p-3 bg-teal-50 rounded-2xl text-teal-600">
               <CalendarDays className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
               <p className="text-xs text-slate-500">กะงานวันนี้</p>
               <p className="text-sm font-semibold text-slate-900 mt-1">{todayShift.shift_name}</p>
               <p className="text-xs text-slate-500 mt-1">{todayShift.start_time} - {todayShift.end_time}</p>
               <p className="text-xs text-slate-400 mt-2">{SHIFT_ASSIGNMENT_STATUS_LABELS[todayShift.status]}</p>
            </div>
            <button
              type="button"
              className="text-xs font-bold text-primary-600"
              onClick={() => router.push('/employee/history?tab=schedule')}
            >
              ดูกะ
            </button>
         </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
         <div className="divide-y divide-slate-100">
            <button 
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              onClick={() => router.push('/employee/history?tab=schedule')}
            >
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary-50 rounded-lg"><CalendarDays className="w-5 h-5 text-primary-600" /></div>
                  <span className="text-sm font-medium text-slate-900">กะงานของฉัน</span>
               </div>
               <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
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
              onClick={() => router.push('/employee/requests')}
            >
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary-50 rounded-lg"><ReceiptText className="w-5 h-5 text-primary-600" /></div>
                  <span className="text-sm font-medium text-slate-900">คำขอและรายงาน</span>
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
