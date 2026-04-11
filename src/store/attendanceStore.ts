'use client';
// ==========================================
// PS Rice Wholesale — Attendance Store (Supabase)
// ==========================================

import { create } from 'zustand';
import type { AttendanceRecord, AttendanceStatus } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { uploadFile, dataURLtoBlob } from '@/lib/storage';

interface AttendanceState {
  records: AttendanceRecord[];
  isLoading: boolean;
  fetchRecords: () => Promise<void>;
  addRecord: (record: Omit<AttendanceRecord, 'id' | 'created_at' | 'server_timestamp'>) => Promise<boolean>;
  getRecordsByUser: (userId: string) => AttendanceRecord[];
  getRecordsByDate: (date: string) => AttendanceRecord[];
  getTodayRecordForUser: (userId: string) => { checkIn?: AttendanceRecord; checkOut?: AttendanceRecord };
  getTodayStatus: (userId: string) => AttendanceStatus;
  getAllTodayRecords: () => AttendanceRecord[];
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

export const useAttendanceStore = create<AttendanceState>((set, get) => ({
  records: [],
  isLoading: false,

  fetchRecords: async () => {
    set({ isLoading: true });
    try {
      // For MVP, we fetch a limited set or all latest records
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
        
      if (error) throw error;
      set({ records: data as AttendanceRecord[], isLoading: false });
    } catch (err) {
      console.error('Failed to fetch attendance:', err);
      set({ isLoading: false });
    }
  },

  addRecord: async (record) => {
    set({ isLoading: true });
    try {
      let finalPhotoUrl = record.photo_url;
      
      // If photo_url is a dataURL (base64), upload it first
      if (record.photo_url?.startsWith('data:')) {
        const blob = dataURLtoBlob(record.photo_url);
        const fileName = `${record.user_id}/${Date.now()}.jpg`;
        const uploadedUrl = await uploadFile('proofs', `attendance/${fileName}`, blob);
        if (uploadedUrl) finalPhotoUrl = uploadedUrl;
      }

      const { data, error } = await supabase
        .from('attendance_records')
        .insert({ ...record, photo_url: finalPhotoUrl })
        .select()
        .single();
      if (error) throw error;
      set(state => ({ records: [data as AttendanceRecord, ...state.records], isLoading: false }));
      return true;
    } catch (err) {
      console.error('Add attendance error:', err);
      set({ isLoading: false });
      return false;
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
      r => r.user_id === userId && r.created_at.startsWith(today)
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
    return get().records.filter(r => r.created_at.startsWith(today));
  },
}));
