'use client';

import { useTaskStore } from '@/store/taskStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useBranchStore } from '@/store/branchStore';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { 
  BarChart3, Download, FileSpreadsheet, FileText, 
  Calendar, Users, CheckCircle2, PieChart as PieChartIcon,
  TrendingUp, TrendingDown, Target
} from 'lucide-react';
import { exportToExcel, exportToCSV } from '@/lib/export';
import { formatThaiDate } from '@/lib/dateUtils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';

export default function ReportsPage() {
  const taskStore = useTaskStore();
  const attendanceStore = useAttendanceStore();
  const employeeStore = useEmployeeStore();
  const branchStore = useBranchStore();

  const handleExportAttendance = () => {
    const data = attendanceStore.records.map(r => {
      const emp = employeeStore.getUserById(r.user_id);
      return {
        'วันที่': formatThaiDate(r.created_at),
        'เวลา': new Date(r.created_at).toLocaleTimeString('th-TH'),
        'ชื่อ-นามสกุล': emp?.full_name,
        'ประเภท': r.type === 'check_in' ? 'เช็กอิน' : 'เช็กเอาต์',
        'สถานะ': r.status,
        'พิกัด': `${r.latitude}, ${r.longitude}`,
      };
    });
    exportToExcel(data, `Attendance_Report_${new Date().toISOString().split('T')[0]}`);
  };

  const handleExportTasks = () => {
    const data = taskStore.tasks.map(t => {
      const emp = employeeStore.getUserById(t.assigned_to);
      const tmpl = t.template_id ? taskStore.getTemplateById(t.template_id) : null;
      return {
        'งาน': t.title || tmpl?.title,
        'ผู้รับผิดชอบ': emp?.full_name,
        'กำหนดส่ง': t.due_date,
        'สถานะ': t.status,
      };
    });
    exportToCSV(data, `Task_Report_${new Date().toISOString().split('T')[0]}`);
  };

  // Chart Logic
  const taskStats = taskStore.getTaskStats();
  const pieData = [
    { name: 'สำเร็จ', value: taskStats.approved, color: '#10b981' },
    { name: 'กำลังทำ', value: taskStats.inProgress + taskStats.submitted, color: '#3b82f6' },
    { name: 'รอเริ่ม', value: taskStats.pending, color: '#94a3b8' },
    { name: 'ล่าช้า', value: taskStats.overdue, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const branchData = branchStore.branches.map(b => {
     const emps = employeeStore.getUsersByBranch(b.id);
     const completed = taskStore.tasks.filter(t => emps.some(e => e.id === t.assigned_to) && t.status === 'approved').length;
     return { name: b.name, completed };
  });

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ตัวชี้วัดและรายงาน</h1>
          <p className="text-slate-500 text-sm mt-1">วิเคราะห์ประสิทธิภาพการทำงานและส่งออกข้อมูลแบบเรียลไทม์</p>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" size="sm" icon={<Calendar className="w-4 h-4" />}>ย้อนหลัง 7 วัน</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
         <Card padding="md" className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 rounded-xl"><Target className="w-6 h-6 text-emerald-600" /></div>
            <div>
               <p className="text-[11px] font-bold text-slate-400 uppercase">Completion Rate</p>
               <p className="text-xl font-bold text-slate-900">{Math.round((taskStats.approved / taskStats.total) * 100) || 0}%</p>
            </div>
         </Card>
         <Card padding="md" className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-xl"><Users className="w-6 h-6 text-blue-600" /></div>
            <div>
               <p className="text-[11px] font-bold text-slate-400 uppercase">Total Workforce</p>
               <p className="text-xl font-bold text-slate-900">{employeeStore.users.length}</p>
            </div>
         </Card>
         <Card padding="md" className="flex items-center gap-4">
            <div className="p-3 bg-slate-50 rounded-xl"><CheckCircle2 className="w-6 h-6 text-slate-600" /></div>
            <div>
               <p className="text-[11px] font-bold text-slate-400 uppercase">Tasks Approved</p>
               <p className="text-xl font-bold text-slate-900">{taskStats.approved}</p>
            </div>
         </Card>
         <Card padding="md" className="flex items-center gap-4">
            <div className="p-3 bg-red-50 rounded-xl"><TrendingDown className="w-6 h-6 text-red-600" /></div>
            <div>
               <p className="text-[11px] font-bold text-slate-400 uppercase">Overdue Tasks</p>
               <p className="text-xl font-bold text-red-600">{taskStats.overdue}</p>
            </div>
         </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Task Distribution Pie */}
         <Card className="flex flex-col h-full">
            <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
               <PieChartIcon className="w-5 h-5 text-primary-600" /> สัดส่วนสถานะงาน
            </h3>
            <div className="h-64 relative">
               <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                     <Pie
                        data={pieData}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                     >
                        {pieData.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                     </Pie>
                     <Tooltip />
                  </PieChart>
               </ResponsiveContainer>
               <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-slate-900">{taskStats.total}</span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Total Tasks</span>
               </div>
            </div>
            <div className="mt-4 space-y-2">
               {pieData.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                     <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="text-slate-600">{d.name}</span>
                     </div>
                     <span className="font-bold text-slate-900">{d.value}</span>
                  </div>
               ))}
            </div>
         </Card>

         {/* Branch Performance Bar */}
         <Card className="lg:col-span-2">
            <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
               <BarChart3 className="w-5 h-5 text-primary-600" /> ประสิทธิภาพรายสาขา (งานที่สำเร็จ)
            </h3>
            <div className="h-64">
               <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={branchData} layout="vertical" margin={{ left: 20 }}>
                     <XAxis type="number" hide />
                     <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: '#475569' }} />
                     <Tooltip cursor={{ fill: '#f8fafc' }} />
                     <Bar dataKey="completed" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
                  </BarChart>
               </ResponsiveContainer>
            </div>
            <div className="mt-4 p-4 bg-primary-50 rounded-xl border border-primary-100 flex items-center gap-3">
               <TrendingUp className="w-5 h-5 text-primary-600" />
               <p className="text-xs text-primary-800 font-medium">
                  สาขาที่มีผลงานสูงสุดคือ <strong>{branchData.sort((a,b) => b.completed - a.completed)[0]?.name}</strong> โดยมีการอนุมัติงานไปแล้วมากกว่าค่าเฉลี่ย
               </p>
            </div>
         </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="flex items-center justify-between p-6">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                 <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                 <h3 className="font-bold text-slate-900">Attendance Log</h3>
                 <p className="text-xs text-slate-500">ข้อมูลการเช็กอินเข้า-ออกทั้งหมด</p>
              </div>
           </div>
           <Button variant="success" size="sm" onClick={handleExportAttendance} icon={<Download className="w-4 h-4" />}>
              Excel
           </Button>
        </Card>

        <Card className="flex items-center justify-between p-6">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                 <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                 <h3 className="font-bold text-slate-900">Task Completion</h3>
                 <p className="text-xs text-slate-500">รายงานผลการปฏิบัติงานรายบุคคล</p>
              </div>
           </div>
           <Button variant="primary" size="sm" onClick={handleExportTasks} icon={<Download className="w-4 h-4" />}>
              CSV
           </Button>
        </Card>
      </div>
    </div>
  );
}
