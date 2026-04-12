'use client';
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useBranchStore } from '@/store/branchStore';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { 
  Clock, Search, Camera,
  User, Building2, Download, Navigation
} from 'lucide-react';
import { ATTENDANCE_STATUS_LABELS } from '@/lib/constants';
import { formatTime } from '@/lib/dateUtils';
import { getAccuracyLevel, getAccuracyColor } from '@/lib/gps';

export default function AttendanceMonitoringPage() {
  const attendanceStore = useAttendanceStore();
  const employeeStore = useEmployeeStore();
  const branchStore = useBranchStore();
  
  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState('all');

  const todayRecords = attendanceStore.getAllTodayRecords().sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const filteredRecords = todayRecords.filter(r => {
    const emp = employeeStore.getUserById(r.user_id);
    const matchesSearch = emp?.full_name.toLowerCase().includes(search.toLowerCase()) || false;
    const matchesBranch = filterBranch === 'all' || r.branch_id === filterBranch;
    return matchesSearch && matchesBranch;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ติดตามการเข้างาน</h1>
          <p className="text-slate-500 text-sm mt-1">ตรวจสอบการลงเวลาแบบ Real-time ของพนักงานทุกคนในวันนี้</p>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" size="sm" icon={<Download className="w-4 h-4" />}>Export วันนี้</Button>
        </div>
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input 
              id="search-att"
              placeholder="ค้นหาชื่อพนักงาน..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          <div className="w-full sm:w-48">
             <select 
               className="w-full h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
               value={filterBranch}
               onChange={(e) => setFilterBranch(e.target.value)}
             >
                <option value="all">ทุกสาขา</option>
                {branchStore.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
             </select>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <th className="px-6 py-3">พนักงาน</th>
                <th className="px-6 py-3">ประเภท / เวลา</th>
                <th className="px-6 py-3">สาขา / พิกัด</th>
                <th className="px-6 py-3">รูปถ่าย</th>
                <th className="px-6 py-3">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.length === 0 ? (
                 <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">ไม่พบประวัติการลงเวลาในวันนี้</td>
                 </tr>
              ) : (
                filteredRecords.map(record => {
                  const emp = employeeStore.getUserById(record.user_id);
                  const branch = branchStore.getBranchById(record.branch_id);
                  const accuracyLevel = getAccuracyLevel(record.gps_accuracy);

                  return (
                    <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-slate-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{emp?.full_name}</p>
                            <p className="text-[10px] text-slate-500">{emp?.team_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                           <span className={`text-xs font-bold ${record.type === 'check_in' ? 'text-emerald-600' : 'text-blue-600'}`}>
                              {record.type === 'check_in' ? 'เช็กอิน' : 'เช็กเอาต์'}
                           </span>
                           <span className="text-sm text-slate-900 font-medium flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              {formatTime(record.created_at)}
                           </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                           <span className="text-xs text-slate-700 font-medium flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              {branch?.name}
                           </span>
                           <span className={`text-[10px] flex items-center gap-1 ${getAccuracyColor(accuracyLevel)}`}>
                              <Navigation className="w-3 h-3" />
                              {record.latitude.toFixed(5)}, {record.longitude.toFixed(5)} ({Math.round(record.gps_accuracy)}m)
                           </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                         <div className="w-10 h-10 rounded bg-slate-100 overflow-hidden relative group">
                            <img src={record.photo_url} alt="Proof" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer">
                               <Camera className="w-4 h-4 text-white" />
                            </div>
                         </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge 
                           variant={
                             record.status === 'late' ? 'warning' : 
                             record.status === 'checked_in' || record.status === 'checked_out' ? 'success' : 'danger'
                           } 
                           dot
                        >
                           {ATTENDANCE_STATUS_LABELS[record.status]}
                        </Badge>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
