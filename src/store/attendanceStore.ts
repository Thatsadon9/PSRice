'use client';
// ==========================================
// PS Rice Wholesale — Attendance Store (Supabase)
// ==========================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AttendanceRecord, AttendanceStatus } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { getCurrentDateStr } from '@/lib/dateUtils';
import { format } from 'date-fns';

/** Extract a human-readable message from any Supabase / JS error. */
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return 'Unknown error';
}

async function handleSessionExpired() {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch { /* best-effort */ }
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

/**
 * Build auth headers for the attendance API.
 * Sends both cookies (automatic) and Bearer token (if available).
 * The server-side handler accepts either method.
 */
async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch { /* cookies will be the fallback */ }
  return headers;
}

interface AttendanceState {
  records: AttendanceRecord[];
  isLoading: boolean;
  error: string | null;
  fetchRecords: () => Promise<void>;
  subscribeToAttendanceUpdates: () => () => void;
  addRecord: (record: Omit<AttendanceRecord, 'id' | 'created_at' | 'server_timestamp'>) => Promise<{ success: boolean; error?: string }>;
  updateAttendanceTimes: (
    updates: Array<{ id: string; created_at: string }>,
    note?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  /** Admin/manager punch without GPS/photo; server sets timestamps from `createdAt`. */
  addManagerManualPunch: (params: {
    userId: string;
    branchId: string;
    type: 'check_in' | 'check_out';
    createdAt: string;
    note?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  getRecordsByUser: (userId: string) => AttendanceRecord[];
  getRecordsByDate: (date: string) => AttendanceRecord[];
  getTodayRecordForUser: (userId: string) => { checkIn?: AttendanceRecord; checkOut?: AttendanceRecord };
  getTodayStatus: (userId: string) => AttendanceStatus;
  getAllTodayRecords: () => AttendanceRecord[];
}

function getToday(): string {
  return getCurrentDateStr();
}

/** Convert a UTC timestamp to a local date string (yyyy-MM-dd) for comparison. */
function toLocalDate(utcTimestamp: string): string {
  try {
    return format(new Date(utcTimestamp), 'yyyy-MM-dd');
  } catch {
    return utcTimestamp.slice(0, 10);
  }
}

function sortRecords(records: AttendanceRecord[]) {
  return [...records].sort((left, right) => {
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

function upsertRecord(records: AttendanceRecord[], record: AttendanceRecord) {
  return sortRecords([record, ...records.filter((item) => item.id !== record.id)]);
}

export const useAttendanceStore = create<AttendanceState>()(
  persist(
    (set, get) => ({
      records: [],
      isLoading: false,
      error: null,

      fetchRecords: async () => {
        set({ isLoading: true, error: null });
        try {
          const authHeaders = await buildAuthHeaders();
          console.log('[Attendance] fetchRecords: hasAuth=', !!authHeaders['Authorization']);

          const response = await fetch('/api/attendance', {
            method: 'GET',
            headers: authHeaders,
            credentials: 'include',
          });

          console.log('[Attendance] fetchRecords: status=', response.status);

          if (response.status === 401) {
            console.warn('[Attendance] fetchRecords: 401 — not authenticated');
            set({ isLoading: false });
            return;
          }

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || 'ดึงข้อมูลไม่สำเร็จ');
          }

          console.log('[Attendance] fetchRecords: received', (result.records || []).length, 'records');
          set({ records: sortRecords((result.records || []) as AttendanceRecord[]), isLoading: false });
        } catch (err) {
          console.error('[Attendance] fetchRecords ERROR:', err);
          set({ isLoading: false, error: extractErrorMessage(err) });
        }
      },

      subscribeToAttendanceUpdates: () => {
        // Real-time subscription uses the anon client which may be blocked by RLS.
        // Wrap in try-catch so it fails silently — the API route handles data freshness.
        try {
          const channel = supabase
            .channel('public:attendance-records')
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'attendance_records' },
              (payload) => {
                if (payload.eventType === 'DELETE') {
                  const deletedId = String(payload.old.id);
                  set((state) => ({
                    records: state.records.filter((record) => record.id !== deletedId),
                  }));
                  return;
                }

                const record = payload.new as AttendanceRecord;
                set((state) => ({
                  records: upsertRecord(state.records, record),
                }));
              },
            )
            .subscribe((status) => {
              if (status === 'CHANNEL_ERROR') {
                console.warn('Attendance realtime subscription blocked by RLS, using API polling');
              }
            });

          return () => {
            void supabase.removeChannel(channel);
          };
        } catch {
          return () => {};
        }
      },

      addRecord: async (record) => {
        set({ isLoading: true, error: null });
        try {
          const authHeaders = await buildAuthHeaders();

          if (!authHeaders['Authorization']) {
            // No access token at all — user is definitely not logged in
            await handleSessionExpired();
            const msg = 'เซสชันหมดอายุ กำลังนำกลับไปหน้าเข้าสู่ระบบ...';
            set({ isLoading: false, error: msg });
            return { success: false, error: msg };
          }

          console.log('[Attendance] addRecord: sending POST, hasAuth=', !!authHeaders['Authorization']);

          const response = await fetch('/api/attendance', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders,
            },
            credentials: 'include',
            body: JSON.stringify(record),
          });

          console.log('[Attendance] addRecord: status=', response.status);

          if (response.status === 401) {
            await handleSessionExpired();
            const msg = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
            set({ isLoading: false, error: msg });
            return { success: false, error: msg };
          }

          const result = await response.json();
          console.log('[Attendance] addRecord: response=', JSON.stringify(result).substring(0, 200));

          if (!response.ok) {
            const errorMsg = result.error || 'ไม่สามารถบันทึกข้อมูลได้';
            console.error('[Attendance] addRecord API error:', result);
            set({ isLoading: false, error: errorMsg });
            return { success: false, error: errorMsg };
          }

          if (result.record) {
            set(state => ({
              records: upsertRecord(state.records, result.record as AttendanceRecord),
              isLoading: false,
            }));
            console.log('[Attendance] addRecord: SUCCESS, record added to store');
          } else {
            set({ isLoading: false });
            console.warn('[Attendance] addRecord: SUCCESS but no record in response');
          }

          return { success: true };
        } catch (err) {
          console.error('[Attendance] addRecord ERROR:', err);
          const errorMessage = extractErrorMessage(err);
          set({ isLoading: false, error: errorMessage });
          return { success: false, error: errorMessage };
        }
      },

      updateAttendanceTimes: async (updates, note) => {
        if (!updates.length) {
          return { success: false, error: 'ไม่มีการอัปเดต' };
        }

        try {
          const authHeaders = await buildAuthHeaders();
          const response = await fetch('/api/attendance', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders,
            },
            credentials: 'include',
            body: JSON.stringify({
              updates,
              ...(typeof note === 'string' && note.trim() ? { note: note.trim() } : {}),
            }),
          });

          const result = (await response.json()) as {
            records?: AttendanceRecord[];
            error?: string;
          };

          if (!response.ok) {
            return { success: false, error: result.error || 'แก้ไขเวลาไม่สำเร็จ' };
          }

          const refreshed = Array.isArray(result.records) ? result.records : [];

          set((state) => ({
            records: refreshed.reduce(
              (acc, record) => upsertRecord(acc, record),
              state.records,
            ),
            error: null,
          }));

          return { success: true };
        } catch (err) {
          const errorMessage = extractErrorMessage(err);
          set({ error: errorMessage });
          return { success: false, error: errorMessage };
        }
      },

      addManagerManualPunch: async ({ userId, branchId, type, createdAt, note }) => {
        try {
          const authHeaders = await buildAuthHeaders();
          const response = await fetch('/api/attendance', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders,
            },
            credentials: 'include',
            body: JSON.stringify({
              manager_manual: true,
              user_id: userId,
              branch_id: branchId,
              type,
              created_at: createdAt,
              ...(typeof note === 'string' && note.trim() ? { notes: note.trim() } : {}),
            }),
          });

          const result = (await response.json()) as {
            record?: AttendanceRecord;
            error?: string;
          };

          if (!response.ok) {
            return { success: false, error: result.error || 'ไม่สามารถเพิ่มรายการได้' };
          }

          if (result.record) {
            set((state) => ({
              records: upsertRecord(state.records, result.record as AttendanceRecord),
              error: null,
            }));
          }

          return { success: true };
        } catch (err) {
          const errorMessage = extractErrorMessage(err);
          set({ error: errorMessage });
          return { success: false, error: errorMessage };
        }
      },

      getRecordsByUser: (userId: string) => {
        return get().records.filter(r => r.user_id === userId);
      },

      getRecordsByDate: (date: string) => {
        return get().records.filter(r => toLocalDate(r.created_at) === date);
      },

      getTodayRecordForUser: (userId: string) => {
        const today = getToday();
        const userRecords = get().records.filter(
          r => r.user_id === userId && toLocalDate(r.created_at) === today
        );
        return {
          checkIn: userRecords.find(r => r.type === 'check_in'),
          checkOut: userRecords.find(r => r.type === 'check_out'),
        };
      },

      getTodayStatus: (userId: string) => {
        const { checkIn, checkOut } = get().getTodayRecordForUser(userId);
        if (checkOut) return 'checked_out';
        if (checkIn) return checkIn.status === 'late' ? 'late' : 'checked_in';
        return 'not_checked_in';
      },

      getAllTodayRecords: () => {
        const today = getToday();
        return get().records.filter(r => toLocalDate(r.created_at) === today);
      },
    }),
    {
      name: 'attendance-storage',
      partialize: (state) => ({ records: state.records }),
    }
  )
);
