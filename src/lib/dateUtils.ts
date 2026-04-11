// ==========================================
// WorkFlow Pro — Date Utilities
// ==========================================

import { format, formatDistanceToNow, isToday, isYesterday, isBefore, parseISO, differenceInMinutes } from 'date-fns';
import { th } from 'date-fns/locale';

export function formatThaiDate(dateStr: string): string {
  const date = parseISO(dateStr);
  return format(date, 'd MMM yyyy', { locale: th });
}

export function formatThaiDateTime(dateStr: string): string {
  const date = parseISO(dateStr);
  return format(date, 'd MMM yyyy HH:mm น.', { locale: th });
}

export function formatTime(dateStr: string): string {
  const date = parseISO(dateStr);
  return format(date, 'HH:mm', { locale: th });
}

export function formatRelativeTime(dateStr: string): string {
  const date = parseISO(dateStr);
  return formatDistanceToNow(date, { addSuffix: true, locale: th });
}

export function formatDayLabel(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'วันนี้';
  if (isYesterday(date)) return 'เมื่อวาน';
  return format(date, 'EEEE d MMM', { locale: th });
}

export function isDateToday(dateStr: string): boolean {
  return isToday(parseISO(dateStr));
}

export function isOverdue(dueDateStr: string): boolean {
  return isBefore(parseISO(dueDateStr), new Date());
}

export function getMinutesLate(checkInTime: string, workStartTime: string = '08:30'): number {
  const checkIn = parseISO(checkInTime);
  const [hours, minutes] = workStartTime.split(':').map(Number);
  const workStart = new Date(checkIn);
  workStart.setHours(hours, minutes, 0, 0);
  return Math.max(0, differenceInMinutes(checkIn, workStart));
}

export function formatDuration(startTime: string, endTime: string): string {
  const start = parseISO(startTime);
  const end = parseISO(endTime);
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
  return format(date, 'วันEEEEที่ d MMMM yyyy', { locale: th });
}
