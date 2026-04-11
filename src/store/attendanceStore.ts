'use client';
// ==========================================
// PS Rice Wholesale — Attendance Store (Supabase)
// ==========================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AttendanceRecord, AttendanceStatus } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { uploadFile, dataURLtoBlob } from '@/lib/storage';

interface AttendanceState {
  records: AttendanceRecord[];
  isLoading: boolean;
  error: string | null;
  fetchRecords: () => Promise<void>;
  addRecord: (record: Omit<AttendanceRecord, 'id' | 'created_at' | 'server_timestamp'>) => Promise<{ success: boolean; error?: string }>;
  getRecordsByUser: (userId: string) => AttendanceRecord[];
  getRecordsByDate: (date: string) => AttendanceRecord[];
  getTodayRecordForUser: (userId: string) => { checkIn?: AttendanceRecord; checkOut?: AttendanceRecord };
  getTodayStatus: (userId: string) => AttendanceStatus;
  getAllTodayRecords: () => AttendanceRecord[];
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
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
          const { data, error } = await supabase
            .from('attendance_records')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1000);
            
          if (error) throw error;
          set({ records: data as AttendanceRecord[], isLoading: false });
        } catch (err) {
          console.error('Failed to fetch attendance:', err);
          set({ isLoading: false, error: err instanceof Error ? err.message : 'Unknown error' });
        }
      },

      addRecord: async (record) => {
        set({ isLoading: true, error: null });
        try {
          let finalPhotoUrl = record.photo_url;
          
          if (record.photo_url?.startsWith('data:')) {
            const blob = dataURLtoBlob(record.photo_url);
            const fileName = `${record.user_id}/${Date.now()}.jpg`;
            const uploadedUrl = await uploadFile('proofs', `attendance/${fileName}`, blob);
            if (uploadedUrl) {
              finalPhotoUrl = uploadedUrl;
            } else {
              throw new Error('คัดลอกไฟล์รูปภาพไม่สำเร็จ (Upload failed)');
            }
          }

          const { data, error } = await supabase
            .from('attendance_records')
            .insert({ ...record, photo_url: finalPhotoUrl })
            .select()
            .single();

          if (error) {
            console.error('Supabase insert error details:', error);
            throw error;
          }

          set(state => ({ 
            records: [data as AttendanceRecord, ...state.records], 
            isLoading: false 
          }));
          return { success: true };
        } catch (err) {
          console.error('Add attendance error:', err);
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          set({ isLoading: false, error: errorMessage });
          return { success: false, error: errorMessage };
        }
      },

      getRecordsByUser: (userId: string) => {
        return get().records.filter(r => r.user_id === userId);
      },

      getRecordsByDate: (date: string) => {
        return get().records.filter(r => r.created_at.startsWith(date));
      },

      getTodayRecordForUser: (userId: string) => {
        const today = getToday();
        const userRecords = get().records.filter(
          r => r.user_id === userId && r.created_at?.startsWith(today)
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
        return get().records.filter(r => r.created_at?.startsWith(today));
      },
    }),
    {
      name: 'attendance-storage',
      partialize: (state) => ({ records: state.records }),
    }
  )
);

