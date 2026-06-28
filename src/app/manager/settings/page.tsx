'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { 
  Bell, Shield, Save, Smartphone, Globe, Coins
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useHrStore } from '@/store/hrStore';

export default function SettingsPage() {
  const [appName, setAppName] = useState('PS Rice');
  const currentUser = useAuthStore(state => state.currentUser);
  const getBranchPolicy = useHrStore(state => state.getBranchPolicy);
  const upsertBranchPolicy = useHrStore(state => state.upsertBranchPolicy);

  const [isSaving, setIsSaving] = useState(false);
  


  const handleSave = async () => {
    if (!currentUser?.branch_id) return;
    setIsSaving(true);
    // await save other settings...
    await new Promise(r => setTimeout(r, 500));
    setIsSaving(false);
    alert('บันทึกการตั้งค่าสำเร็จ');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">การตั้งค่าระบบ</h1>
        <p className="text-slate-500 text-sm mt-1">จัดการการตั้งค่าพื้นฐานและการแจ้งเตือนของแอปพลิเคชัน</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <div className="lg:col-span-2 space-y-6">
            <Card>
               <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary-600" />
                  การตั้งค่าทั่วไป
               </h3>
               <div className="space-y-4">
                  <Input 
                     label="ชื่อแอปพลิเคชัน" 
                     value={appName} 
                     onChange={(e) => setAppName(e.target.value)} 
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <Input label="เวลาเข้างานมาตรฐาน" type="time" defaultValue="08:30" />
                     <Input label="เวลาเลิกงานมาตรฐาน" type="time" defaultValue="17:30" />
                  </div>
               </div>
            </Card>



            <Card>
               <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary-600" />
                  ความปลอดภัยและข้อกำหนด
               </h3>
               <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                     <div>
                        <p className="text-sm font-semibold text-slate-900">บังคับใช้ Geofencing</p>
                        <p className="text-xs text-slate-500">ไม่อนุญาตให้เช็กอินหากอยู่นอกพื้นที่สาขา</p>
                     </div>
                     <input type="checkbox" defaultChecked className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                     <div>
                        <p className="text-sm font-semibold text-slate-900">บังคับถ่ายรูปสด (Live Camera)</p>
                        <p className="text-xs text-slate-500">ไม่อนุญาตให้อัปโหลดรูปจากแกลเลอรี</p>
                     </div>
                     <input type="checkbox" defaultChecked className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500" />
                  </div>
               </div>
            </Card>
            
            <div className="flex justify-end">
               <Button loading={isSaving} onClick={handleSave} icon={<Save className="w-4 h-4" />}>บันทึกการตั้งค่าทั้งหมด</Button>
            </div>
         </div>

         <div className="space-y-6">
            <Card>
               <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Bell className="w-5 h-5 text-primary-600" />
                  การแจ้งเตือน
               </h3>
               <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                     <input type="checkbox" defaultChecked className="rounded text-primary-600" /> แจ้งเตือนเมื่อมีพนักงานเช็กอินสาย
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                     <input type="checkbox" defaultChecked className="rounded text-primary-600" /> แจ้งเตือนเมื่อมีการส่งงานใหม่
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                     <input type="checkbox" className="rounded text-primary-600" /> แจ้งเตือนสรุปยอดประจำวัน
                  </label>
               </div>
            </Card>

            <Card className="bg-primary-900 text-white">
               <div className="flex flex-col items-center text-center p-2">
                  <Smartphone className="w-10 h-10 text-primary-300 mb-3" />
                  <h3 className="font-bold mb-1">Mobile PWA</h3>
                  <p className="text-xs text-primary-200 leading-relaxed">
                     ติดตั้งแอปพลิเคชันลงบนมือถือเพื่อการแจ้งเตือนที่รวดเร็วและใช้งานได้เสถียรยิ่งขึ้น
                  </p>
               </div>
            </Card>
         </div>
      </div>
    </div>
  );
}
