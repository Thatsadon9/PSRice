'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { useTaskStore } from '@/store/taskStore';
import { useAttendanceStore } from '@/store/attendanceStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useHrStore } from '@/store/hrStore';
import { useBranchStore } from '@/store/branchStore';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  CheckCircle2,
  CheckSquare,
  ClipboardList,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  MapPin,
  Menu,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Users,
  UserPlus,
  Zap,
} from 'lucide-react';
import { formatThaiDate } from '@/lib/dateUtils';
import { getPendingReviewSubmissionsForUser } from '@/lib/reviewHelpers';

export default function ManagerDashboard() {
  const { currentUser } = useAuthStore();
  const taskStore = useTaskStore();
  const attendanceStore = useAttendanceStore();
  const employeeStore = useEmployeeStore();
  const branchStore = useBranchStore();
  const { shiftAssignments, employeeRequests, branchPolicies } = useHrStore();

  // Derived Data for the Command Center
  const dashboardData = useMemo(() => {
    if (!currentUser) {
      return {
        submissions: [],
        pendingRequests: [],
        activeStaff: [],
        recentActivity: [],
        branchEmployees: [],
        overdueCount: 0,
        todayRecordsCount: 0,
      };
    }

    // 1. Pending Approvals (Mixed Feed: Reviews + Leaves + Advances)
    const submissions = getPendingReviewSubmissionsForUser(
      taskStore.submissions,
      currentUser,
      employeeStore.users,
    );

    const pendingRequests = employeeRequests.filter(req => 
      req.status === 'pending' && 
      (!currentUser.branch_id || req.branch_id === currentUser.branch_id)
    );

    const activeBranchId = currentUser.branch_id || branchStore.branches[0]?.id;
    const branchEmployees = employeeStore.users.filter(u => u.branch_id === activeBranchId && u.role === 'employee');
    
    // 2. Currently Working Now
    const todayRecords = attendanceStore.getAllTodayRecords();
    const activeStaff = todayRecords.filter(r => r.type === 'check_in' && !todayRecords.find(out => out.user_id === r.user_id && out.type === 'check_out'));
    
    // 3. Recent Activity (Latest 8 events)
    const recentActivity = attendanceStore.records.slice(0, 8);

    // 4. Overdue Tasks
    const overdueCount = taskStore.getTaskStats().overdue;

    return {
      submissions,
      pendingRequests,
      activeStaff,
      recentActivity,
      branchEmployees,
      overdueCount,
      todayRecordsCount: todayRecords.length
    };
  }, [attendanceStore, branchStore, currentUser, employeeRequests, employeeStore, taskStore]);

  if (!currentUser) return null;

  const stats = [
    {
      label: 'พนักงานปฏิบัติงานอยู่',
      value: dashboardData.activeStaff.length,
      unit: 'คน',
      icon: Activity,
      color: 'emerald',
      desc: `จากพนักงานทั้งหมด ${dashboardData.branchEmployees.length} คน`
    },
    {
      label: 'รายการรออนุมัติ',
      value: dashboardData.submissions.length + dashboardData.pendingRequests.length,
      unit: 'รายการ',
      icon: CheckSquare,
      color: 'amber',
      desc: 'คำขอลา เบิกเงิน และงานส่งตรวจ'
    },
    {
      label: 'บันทึกเวลาวันนี้',
      value: dashboardData.todayRecordsCount,
      unit: 'ครั้ง',
      icon: ShieldCheck,
      color: 'blue',
      desc: 'รวมบันทึกเข้าและออกทั้งหมด'
    },
    {
      label: 'งานเกินกำหนด',
      value: dashboardData.overdueCount,
      unit: 'งาน',
      icon: ShieldAlert,
      color: 'red',
      desc: 'งานที่ยังไม่เสร็จและเลยกำหนด'
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Premium Hero Header */}
      <div className="relative overflow-hidden bg-slate-900 rounded-[2rem] p-8 text-white shadow-2xl">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="bg-primary-500/20 text-primary-400 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-primary-500/30">
                Operations Center
              </span>
              <span className="text-slate-500 text-[10px] font-bold">
                {formatThaiDate(new Date().toISOString())}
              </span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-black leading-tight">
              ยินดีต้อนรับกลับ, <span className="text-primary-400">{currentUser.full_name}</span>
            </h1>
            <p className="text-slate-400 mt-2 text-sm max-w-xl leading-relaxed">
              วันนี้มีรายการที่คุณต้องตรวจสอบทั้งหมด {dashboardData.submissions.length + dashboardData.pendingRequests.length} รายการ 
              และมีพนักงานปฏิบัติงานอยู่ในขณะนี้ {dashboardData.activeStaff.length} คน
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3">
            <Link href="/manager/assignments">
              <Button size="lg" variant="none" className="bg-white text-slate-900 hover:bg-slate-100 rounded-2xl border-none shadow-xl shadow-white/5 px-6 py-3.5 text-base font-bold flex items-center gap-2">
                <Plus className="w-5 h-5 flex-shrink-0" /> มอบหมายงาน
              </Button>
            </Link>
            <Link href="/manager/schedule">
              <Button size="lg" variant="outline" className="text-white border-slate-700 hover:bg-slate-800 rounded-2xl backdrop-blur-sm">
                <CalendarCheck className="w-5 h-5 mr-3" /> จัดการตารางกะ
              </Button>
            </Link>
          </div>
        </div>
        
        {/* Background Accents */}
        <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-primary-500/10 to-transparent pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Quick Actions Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'เพิ่มพนักงานใหม่', icon: UserPlus, href: '/manager/employees', color: 'bg-blue-50 text-blue-600' },
          { label: 'สรุปรายได้พนักงาน', icon: FileSpreadsheet, href: '/manager/payroll', color: 'bg-emerald-50 text-emerald-600' },
          { label: 'รายงานวิเคราะห์', icon: LayoutDashboard, href: '/manager/reports', color: 'bg-indigo-50 text-indigo-600' },
          { label: 'ตั้งค่าระบบ', icon: Zap, href: '/manager/settings', color: 'bg-amber-50 text-amber-600' },
        ].map((action) => (
          <Link key={action.label} href={action.href}>
            <button className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-primary-200 hover:shadow-md transition-all group">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${action.color} group-hover:scale-110 transition-transform`}>
                  <action.icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-slate-700">{action.label}</span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-primary-500 transition-colors" />
            </button>
          </Link>
        ))}
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} padding="md" className="group hover:border-slate-300 transition-all border-slate-100">
            <div className={`h-11 w-11 mb-4 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 shadow-sm
              ${stat.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' : ''}
              ${stat.color === 'amber' ? 'bg-amber-50 text-amber-600' : ''}
              ${stat.color === 'blue' ? 'bg-blue-50 text-blue-600' : ''}
              ${stat.color === 'red' ? 'bg-red-50 text-red-600' : ''}
            `}>
              <stat.icon className="w-5 h-5" />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">{stat.label}</p>
            <div className="flex items-baseline gap-1 mt-1">
              <p className="text-2xl font-black text-slate-900 leading-none">{stat.value}</p>
              <span className="text-[10px] font-bold text-slate-400 leading-none">{stat.unit}</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-3 font-medium border-t border-slate-50 pt-2">{stat.desc}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Col: Monitoring & Activity */}
        <div className="xl:col-span-2 space-y-6">
          {/* Active Monitoring */}
          <Card className="border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <Timer className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">การติดตามหน้างาน (Live Operations)</h2>
                  <p className="text-xs text-slate-500 mt-1">ตรวจสอบพนักงานที่กำลังทำงานอยู่ในขณะนี้</p>
                </div>
              </div>
              <Link href="/manager/attendance">
                <Button variant="ghost" size="sm" className="text-xs font-bold text-primary-600" icon={<ArrowRight className="w-3 h-3" />}>
                  ดูทั้งหมด
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dashboardData.activeStaff.length === 0 ? (
                <div className="col-span-2 py-12 flex flex-col items-center justify-center bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
                  <Users className="w-10 h-10 text-slate-200 mb-2" />
                  <p className="text-sm font-bold text-slate-400">ยังไม่มีพนักงานเริ่มงานในขณะนี้</p>
                </div>
              ) : (
                dashboardData.activeStaff.slice(0, 6).map((record) => {
                  const employee = employeeStore.getUserById(record.user_id);
                  return (
                    <div key={record.id} className="p-4 rounded-3xl bg-white border border-slate-100 hover:border-emerald-200 hover:shadow-lg transition-all flex items-center gap-4 group">
                      <div className="relative">
                        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors shrink-0 overflow-hidden">
                          {employee?.avatar_url ? (
                            <img src={employee.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : employee?.full_name?.charAt(0)}
                        </div>
                        <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-white flex items-center justify-center shadow-sm">
                          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900">{employee?.full_name}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] font-bold text-slate-400">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(record.created_at).toLocaleTimeString('th-TH')}</span>
                          <span className={`flex items-center gap-1 ${record.verified_in_geofence ? 'text-emerald-600' : 'text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full'}`}>
                            <MapPin className="w-3 h-3" /> {record.verified_in_geofence ? 'ในพื้นที่' : 'นอกพื้นที่'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* Activity Logs */}
          <Card className="border-slate-200 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">บันทึกล่าสุด</h2>
                  <p className="text-xs text-slate-500 mt-1">ประวัติการเข้า-ออกของพนักงาน</p>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              {dashboardData.recentActivity.map((record) => {
                const employee = employeeStore.getUserById(record.user_id);
                const isCheckIn = record.type === 'check_in';
                return (
                  <div key={record.id} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 transition-colors">
                    <div className={`h-2 w-2 rounded-full ${isCheckIn ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <span className="text-[11px] font-bold text-slate-400 tabular-nums w-14 shrink-0">
                      {new Date(record.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <p className="text-sm font-bold text-slate-700 flex-1 truncate">{employee?.full_name}</p>
                    <Badge variant={isCheckIn ? 'success' : 'slate'} className="px-2 py-0.5 text-[9px] font-black uppercase tracking-tight">
                      {isCheckIn ? 'IN' : 'OUT'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right Col: Action Center */}
        <div className="space-y-6">
          <Card className="h-full flex flex-col shadow-xl border-slate-200" padding="none">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 leading-none">ศูนย์จัดการงาน</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">Action Required</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-200">
                  <CheckSquare className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[600px]">
              {/* Requests Section */}
              {dashboardData.pendingRequests.length > 0 && (
                <div className="space-y-2">
                  <p className="px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">คำขอพนักงาน</p>
                  {dashboardData.pendingRequests.map((req) => {
                    const employee = employeeStore.getUserById(req.user_id);
                    return (
                      <Link key={req.id} href="/manager/requests">
                        <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-100 hover:border-amber-300 transition-all group">
                          <div className="flex justify-between items-start mb-2">
                            <p className="text-xs font-black text-amber-700 uppercase tracking-tighter">
                              {req.request_type === 'leave' ? 'ลาพักผ่อน' : req.request_type === 'advance' ? 'เบิกเงินล่วงหน้า' : 'เบิกค่าใช้จ่าย'}
                            </p>
                            <ArrowRight className="w-3 h-3 text-amber-400 group-hover:translate-x-1 transition-transform" />
                          </div>
                          <p className="text-sm font-bold text-slate-900">{employee?.full_name}</p>
                          <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">{req.title || '-'}</p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}

              {/* Task Submissions Section */}
              <div className="space-y-2">
                <p className="px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">งานส่งตรวจ</p>
                {dashboardData.submissions.length === 0 && dashboardData.pendingRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-100 mb-3" />
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">ไม่มีงานค้างในขณะนี้</p>
                  </div>
                ) : (
                  dashboardData.submissions.map((submission) => {
                    const employee = employeeStore.getUserById(submission.submitted_by);
                    const task = taskStore.getTaskById(submission.task_id);
                    const template = task?.template_id ? taskStore.getTemplateById(task.template_id) : null;

                    return (
                      <Link key={submission.id} href={`/manager/review/${submission.id}`}>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-primary-200 hover:bg-white transition-all group shadow-sm hover:shadow-md">
                          <div className="flex justify-between items-start mb-2">
                            <Badge variant="slate" className="text-[9px] font-black bg-white">REVIEWS</Badge>
                            <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all" />
                          </div>
                          <p className="text-sm font-bold text-slate-900 truncate">{task?.title || template?.title || 'รายการงาน'}</p>
                          <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase leading-none">{employee?.full_name}</p>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-[2rem]">
              <Link href="/manager/review">
                <Button size="sm" fullWidth variant="ghost" className="text-xs font-bold text-primary-600 hover:bg-white border-none shadow-none">
                  เข้าสู่โหมดการตรวจสอบทั้งหมด
                </Button>
              </Link>
            </div>
          </Card>
          
          {/* Quick Stats Summary */}
          <div className="p-6 bg-gradient-to-br from-primary-600 to-indigo-700 rounded-[2rem] text-white shadow-xl relative overflow-hidden group">
            <h3 className="text-sm font-bold mb-4 relative z-10">ภาพรวมรายสัปดาห์</h3>
            <div className="space-y-4 relative z-10">
              <div className="flex justify-between items-center text-xs">
                <span className="text-primary-100">พนักงานตรงตามเวลา</span>
                <span className="font-bold">92%</span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-primary-400 w-[92%]" />
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-primary-100">อัตราการลาเฉลี่ย</span>
                <span className="font-bold">2.4%</span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-400 w-[15%]" />
              </div>
            </div>
            
            <Zap className="absolute -bottom-4 -right-4 w-24 h-24 text-white/5 rotate-12 group-hover:scale-110 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
}
