'use client';

import { useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useHrStore } from '@/store/hrStore';
import { useBranchStore } from '@/store/branchStore';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Building2,
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  addDays,
} from 'date-fns';
import { th } from 'date-fns/locale';
import { SHIFT_ASSIGNMENT_STATUS_LABELS } from '@/lib/constants';
import { ZoomIn, ZoomOut, Zap, Calendar as CalendarIcon } from 'lucide-react';

export default function EmployeeSchedulePage() {
  const { currentUser } = useAuthStore();
  const hrStore = useHrStore();
  const branchStore = useBranchStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [selectedDate, setSelectedDate] = useState(new Date());

  const myAssignments = currentUser ? hrStore.getAssignmentsByUser(currentUser.id) : [];

  // Logic for a full 42-day month grid (to keep layout consistent)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Start on Monday
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    
    // Ensure we always show 6 rows (42 days) for visual stability
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const remainingDays = 42 - days.length;
    
    if (remainingDays > 0) {
      const lastDay = days[days.length - 1];
      for (let i = 1; i <= remainingDays; i++) {
        days.push(addDays(lastDay, i));
      }
    }
    
    return days;
  }, [currentMonth]);

  const daysInMonthList = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth),
    });
  }, [currentMonth]);

  if (!currentUser) return null;

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const getShiftVariant = (status: string) => {
    switch (status) {
      case 'scheduled': return 'success';
      case 'leave': return 'danger';
      case 'day_off': return 'slate';
      default: return 'default';
    }
  };

  return (
    <div className="px-4 py-8 space-y-6 animate-fade-in pb-24 max-w-lg mx-auto">
      {/* Header & Month Navigation */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-slate-900 leading-tight">ตารางกะงาน</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Schedule Terminal</p>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-slate-900 flex items-center justify-center text-primary-400">
             <Zap className="w-6 h-6 fill-primary-400/20" />
          </div>
        </div>

        <div className="flex items-center justify-between bg-white p-2 rounded-[2rem] border border-slate-100 shadow-sm">
          <button onClick={handlePrevMonth} className="p-3 hover:bg-slate-50 rounded-2xl text-slate-400 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center min-w-[140px]">
            <span className="text-sm font-black text-slate-900 block truncate">
              {format(currentMonth, 'MMMM yyyy', { locale: th })}
            </span>
          </div>
          <button onClick={handleNextMonth} className="p-3 hover:bg-slate-50 rounded-2xl text-slate-400 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* View Switcher / Zoom Controls */}
      <div className="fixed bottom-24 right-4 z-50 flex flex-col gap-3">
         <button 
           onClick={() => setCurrentMonth(new Date())}
           className="h-14 w-14 rounded-2xl bg-white text-slate-900 border border-slate-200 shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
           title="Today"
         >
           <Zap className="w-6 h-6 fill-primary-500 text-primary-500" />
         </button>
         <button 
           onClick={() => setViewMode(viewMode === 'calendar' ? 'list' : 'calendar')}
           className="h-14 w-14 rounded-2xl bg-slate-900 text-white shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
           title={viewMode === 'calendar' ? 'Zoom In (List)' : 'Zoom Out (Calendar)'}
         >
           {viewMode === 'calendar' ? <ZoomIn className="w-6 h-6" /> : <ZoomOut className="w-6 h-6" />}
         </button>
      </div>

      {viewMode === 'calendar' ? (
        <div className="space-y-4 animate-in fade-in zoom-in-95 duration-500">
           {/* Calendar Weekday Names */}
           <div className="grid grid-cols-7 gap-1 px-1">
             {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
               <div key={i} className="text-center py-2">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{day}</span>
               </div>
             ))}
           </div>

           {/* Calendar Grid */}
           <div className="grid grid-cols-7 gap-1.5">
             {calendarDays.map((day, i) => {
               const dateStr = format(day, 'yyyy-MM-dd');
               const assignment = myAssignments.find(a => a.work_date === dateStr);
               const isCurrentMonth = isSameMonth(day, currentMonth);
               const isToday = isSameDay(day, new Date());
               const isSelected = isSameDay(day, selectedDate);
               const variant = assignment ? getShiftVariant(assignment.status) : null;

               return (
                 <button
                   key={i}
                   onClick={() => {
                     setSelectedDate(day);
                     // If they click a day with an assignment, maybe show list view?
                     // setViewMode('list'); 
                   }}
                   className={`
                     aspect-square rounded-2xl flex flex-col items-center justify-center relative transition-all
                     ${isCurrentMonth ? 'bg-white border border-slate-100' : 'bg-slate-50/50 opacity-30'}
                     ${isToday ? 'ring-2 ring-primary-500 bg-primary-50' : ''}
                     ${isSelected ? 'shadow-xl shadow-slate-200 border-primary-100 -translate-y-0.5' : ''}
                   `}
                 >
                   <span className={`text-xs font-black ${isCurrentMonth ? 'text-slate-900' : 'text-slate-400'} ${isToday ? 'text-primary-600' : ''}`}>
                     {format(day, 'd')}
                   </span>
                   {assignment && (
                     <div className={`mt-1 h-1.5 w-1.5 rounded-full ${
                       variant === 'success' ? 'bg-emerald-500' : 
                       variant === 'danger' ? 'bg-red-500' : 'bg-slate-400'
                     } ${assignment.status === 'scheduled' ? 'animate-pulse' : ''}`} />
                   )}
                 </button>
               );
             })}
           </div>

           {/* Selected Day Context */}
           {selectedDate && (
             <Card className="rounded-[2.5rem] border-slate-100 p-5 mt-8 animate-in slide-in-from-bottom-4">
                <div className="flex items-center justify-between mb-4">
                   <div className="flex items-center gap-3">
                      <div className="p-3 bg-slate-900 text-white rounded-2xl">
                         <CalendarIcon className="w-5 h-5" />
                      </div>
                      <div>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Focus Date</p>
                         <h3 className="text-sm font-black text-slate-900">{format(selectedDate, 'EEEE d MMMM', { locale: th })}</h3>
                      </div>
                   </div>
                   {isSameDay(selectedDate, new Date()) && (
                     <Badge variant="info" className="font-black uppercase text-[9px]">Today</Badge>
                   )}
                </div>

                {(() => {
                  const assignment = myAssignments.find(a => a.work_date === format(selectedDate, 'yyyy-MM-dd'));
                  const branch = assignment?.branch_id ? branchStore.getBranchById(assignment.branch_id) : null;
                  
                  if (!assignment) return (
                    <div className="py-6 text-center bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">No Shifts Logged</p>
                       <p className="text-xs font-bold text-slate-300">Contact admin if this is unexpected</p>
                    </div>
                  );

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-2">
                           <Clock className="w-4 h-4 text-primary-500" />
                           <span className="text-sm font-black text-slate-900">{assignment.start_time} - {assignment.end_time}</span>
                         </div>
                         <Badge variant={getShiftVariant(assignment.status)} className="font-black uppercase text-[9px] tracking-tight">
                            {SHIFT_ASSIGNMENT_STATUS_LABELS[assignment.status]}
                         </Badge>
                      </div>
                      
                      <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                         <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-slate-400" />
                            <span className="text-[11px] font-bold text-slate-500">{branch?.name || 'Branch Terminal'}</span>
                         </div>
                         <button className="text-[10px] font-black text-primary-600 uppercase tracking-widest">Details</button>
                      </div>
                    </div>
                  );
                })()}
             </Card>
           )}
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
           {daysInMonthList.map((day) => {
             const dateStr = format(day, 'yyyy-MM-dd');
             const assignment = myAssignments.find((a) => a.work_date === dateStr);
             const isToday = isSameDay(day, new Date());
             const branch = assignment?.branch_id ? branchStore.getBranchById(assignment.branch_id) : null;

             return (
               <Card
                 key={dateStr}
                 padding="none"
                 className={`overflow-hidden transition-all duration-300 rounded-[2rem] border-slate-100 ${isToday ? 'ring-2 ring-primary-500 shadow-xl' : 'shadow-sm'}`}
               >
                 <div className="flex h-24">
                   <div className={`w-20 shrink-0 flex flex-col items-center justify-center border-r ${isToday ? 'bg-primary-50 border-primary-100' : 'bg-slate-50 border-slate-100'}`}>
                     <span className={`text-[10px] font-black uppercase ${isToday ? 'text-primary-600' : 'text-slate-400'}`}>
                       {format(day, 'EEE', { locale: th })}
                     </span>
                     <span className={`text-2xl font-black ${isToday ? 'text-primary-700' : 'text-slate-700'}`}>
                       {format(day, 'd')}
                     </span>
                   </div>

                   <div className="flex-1 p-5 min-w-0">
                     {assignment ? (
                       <div className="h-full flex flex-col justify-between">
                         <div className="flex items-center justify-between gap-3">
                           <h3 className="text-sm font-black text-slate-900 truncate">
                             {assignment.shift_name}
                           </h3>
                           <Badge
                             variant={getShiftVariant(assignment.status)}
                             className="px-2 py-0.5 text-[9px] font-black uppercase tracking-tight"
                           >
                             {SHIFT_ASSIGNMENT_STATUS_LABELS[assignment.status]}
                           </Badge>
                         </div>

                         <div className="flex items-center justify-between text-slate-400">
                           <div className="flex items-center gap-1.5">
                             <Clock className="w-3.5 h-3.5 text-primary-400" />
                             <span className="text-[11px] font-black text-slate-600">{assignment.start_time} - {assignment.end_time}</span>
                           </div>
                           {branch && (
                             <div className="flex items-center gap-1 text-[10px] font-bold">
                               <Building2 className="w-3 h-3" /> {branch.name}
                             </div>
                           )}
                         </div>
                       </div>
                     ) : (
                       <div className="h-full flex flex-col justify-center">
                         <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Unassigned</p>
                         <p className="text-[11px] font-bold text-slate-400">No shift currently logged</p>
                       </div>
                     )}
                   </div>
                 </div>
               </Card>
             );
           })}
        </div>
      )}
    </div>
  );
}
