'use client';
// ==========================================
// PS Rice Wholesale — Notification Store (Supabase)
// ==========================================

import { create } from 'zustand';
import type { Notification } from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface NotificationState {
  notifications: Notification[];
  isLoading: boolean;
  fetchNotifications: (userId: string) => Promise<void>;
  getNotificationsByUser: (userId: string) => Notification[];
  getUnreadCount: (userId: string) => number;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: (userId: string) => Promise<void>;
  addNotification: (notification: Omit<Notification, 'id' | 'created_at'>) => Promise<void>;
  subscribeToNotifications: (userId: string) => () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  isLoading: false,

  fetchNotifications: async (userId: string) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      set({ notifications: data as Notification[], isLoading: false });
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      set({ isLoading: false });
    }
  },

  getNotificationsByUser: (userId: string) => {
    return get().notifications
      .filter(n => n.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  getUnreadCount: (userId: string) => {
    return get().notifications.filter(n => n.user_id === userId && !n.is_read).length;
  },

  markAsRead: async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;
      
      set(state => ({
        notifications: state.notifications.map(n =>
          n.id === notificationId ? { ...n, is_read: true } : n
        ),
      }));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  },

  markAllAsRead: async (userId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId);

      if (error) throw error;

      set(state => ({
        notifications: state.notifications.map(n =>
          n.user_id === userId ? { ...n, is_read: true } : n
        ),
      }));
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  },

  addNotification: async (notification) => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert(notification)
        .select()
        .single();

      if (error) throw error;
      set(state => ({ notifications: [data as Notification, ...state.notifications] }));
    } catch (err) {
      console.error('Failed to add notification:', err);
    }
  },

  subscribeToNotifications: (userId: string) => {
    const channel = supabase
      .channel('public:notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const newNotif = payload.new as Notification;
          set(state => ({ notifications: [newNotif, ...state.notifications] }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
}));
