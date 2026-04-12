// ==========================================
// WorkFlow Pro - Date Utilities
// ==========================================

import {
  differenceInMinutes,
  endOfDay,
  format,
  formatDistanceToNow,
  isBefore,
  isSameDay,
  isToday,
  isValid,
  isWithinInterval,
  isYesterday,
  parseISO,
  startOfDay,
} from 'date-fns';
import { th } from 'date-fns/locale';

function parseAppDate(dateStr: string): Date | null {
  if (!dateStr) {
    return null;
  }

  const parsed = parseISO(dateStr);
  return isValid(parsed) ? parsed : null;
}

export function formatThaiDate(dateStr: string): string {
  const date = parseAppDate(dateStr);
  if (!date) return dateStr;
  return format(date, 'd MMM yyyy', { locale: th });
}

export function formatThaiDateTime(dateStr: string): string {
  const date = parseAppDate(dateStr);
  if (!date) return dateStr;
  return format(date, "d MMM yyyy HH:mm 'น.'", { locale: th });
}

export function formatTime(dateStr: string): string {
  const date = parseAppDate(dateStr);
  if (!date) return dateStr;
  return format(date, 'HH:mm', { locale: th });
}

export function formatRelativeTime(dateStr: string): string {
  const date = parseAppDate(dateStr);
  if (!date) return dateStr;
  return formatDistanceToNow(date, { addSuffix: true, locale: th });
}

export function formatDayLabel(dateStr: string): string {
  const date = parseAppDate(dateStr);
  if (!date) return dateStr;
  if (isToday(date)) return 'วันนี้';
  if (isYesterday(date)) return 'เมื่อวาน';
  return format(date, 'EEEE d MMM', { locale: th });
}

export function isDateToday(dateStr: string): boolean {
  const date = parseAppDate(dateStr);
  return date ? isToday(date) : false;
}

export function isSameCalendarDate(dateStr: string, compareDate: string | Date): boolean {
  const date = parseAppDate(dateStr);

  if (!date) {
    return false;
  }

  const target = compareDate instanceof Date ? compareDate : parseAppDate(compareDate);
  return target ? isSameDay(date, target) : false;
}

export function isDateWithinRange(dateStr: string, startDate: string | Date, endDate: string | Date): boolean {
  const date = parseAppDate(dateStr);

  if (!date) {
    return false;
  }

  const start = startDate instanceof Date ? startDate : parseAppDate(startDate);
  const end = endDate instanceof Date ? endDate : parseAppDate(endDate);

  if (!start || !end) {
    return false;
  }

  return isWithinInterval(date, {
    start: startOfDay(start),
    end: endOfDay(end),
  });
}

export function isOverdue(dueDateStr: string): boolean {
  const dueDate = parseAppDate(dueDateStr);
  return dueDate ? isBefore(dueDate, new Date()) : false;
}

export function getMinutesLate(checkInTime: string, workStartTime: string = '08:30'): number {
  const checkIn = parseAppDate(checkInTime);
  if (!checkIn) return 0;

  const [hours, minutes] = workStartTime.split(':').map(Number);
  const workStart = new Date(checkIn);
  workStart.setHours(hours, minutes, 0, 0);
  return Math.max(0, differenceInMinutes(checkIn, workStart));
}

export function formatDuration(startTime: string, endTime: string): string {
  const start = parseAppDate(startTime);
  const end = parseAppDate(endTime);
  if (!start || !end) return '';

  const mins = differenceInMinutes(end, start);
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hours === 0) return `${remainMins} นาที`;
  return `${hours} ชม. ${remainMins} นาที`;
}

export function getCurrentDateStr(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function getCurrentTimeStr(): string {
  return format(new Date(), 'HH:mm:ss');
}

export function formatThaiFullDate(date: Date): string {
  return format(date, "วันEEEEที่ d MMMM yyyy", { locale: th });
}
