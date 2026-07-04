'use client';
// ==========================================
// PS Rice Wholesale — Notification Store (Supabase)
// ==========================================

import { create } from 'zustand';
import type { Notification } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js';

interface NotificationState {
  notifications: Notification[];
  isLoading: boolean;
  fetchNotifications: (userId: string) => Promise<void>;
  getNotificationsByUser: (userId: string) => Notification[];
  getUnreadCount: (userId: string) => number;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: (userId: string) => Promise<void>;
  archiveNotification: (notificationId: string) => Promise<void>;
  archiveReadNotifications: (userId: string) => Promise<void>;
  addNotification: (notification: Omit<Notification, 'id' | 'created_at'>) => Promise<void>;
  subscribeToNotifications: (userId: string) => () => void;
}

function sortNotifications(notifications: Notification[]) {
  return [...notifications].sort((left, right) => {
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

function upsertNotification(notifications: Notification[], notification: Notification) {
  return sortNotifications([notification, ...notifications.filter((item) => item.id !== notification.id)]);
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
      set({ notifications: sortNotifications(data as Notification[]), isLoading: false });
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      set({ isLoading: false });
    }
  },

  getNotificationsByUser: (userId: string) => {
    return get().notifications.filter((notification) => notification.user_id === userId);
  },

  getUnreadCount: (userId: string) => {
    return get().notifications.filter(n => (
      n.user_id === userId &&
      !n.is_read &&
      n.status !== 'archived' &&
      !n.archived_at
    )).length;
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

  archiveNotification: async (notificationId: string) => {
    const archivedAt = new Date().toISOString();

    set(state => ({
      notifications: state.notifications.map(n =>
        n.id === notificationId
          ? { ...n, is_read: true, status: 'archived', archived_at: archivedAt }
          : n
      ),
    }));

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, status: 'archived', archived_at: archivedAt })
      .eq('id', notificationId);

    if (!error) {
      return;
    }

    console.warn('Notification archive fields unavailable, falling back to read-only update:', error.message || error);
    const { error: fallbackError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (fallbackError) {
      console.error('Failed to archive notification:', fallbackError);
    }
  },

  archiveReadNotifications: async (userId: string) => {
    const archivedAt = new Date().toISOString();
    const readableIds = get().notifications
      .filter((notification) => notification.user_id === userId && notification.is_read && !notification.archived_at)
      .map((notification) => notification.id);

    if (readableIds.length === 0) {
      return;
    }

    set(state => ({
      notifications: state.notifications.map(n =>
        readableIds.includes(n.id)
          ? { ...n, status: 'archived', archived_at: archivedAt }
          : n
      ),
    }));

    const { error } = await supabase
      .from('notifications')
      .update({ status: 'archived', archived_at: archivedAt })
      .eq('user_id', userId)
      .eq('is_read', true)
      .is('archived_at', null);

    if (!error) {
      return;
    }

    console.warn('Bulk notification archive fields unavailable:', error.message || error);
  },

  addNotification: async (notification) => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert(notification)
        .select()
        .single();

      if (error) throw error;
      set((state) => ({ notifications: upsertNotification(state.notifications, data as Notification) }));
    } catch (err) {
      console.error('Failed to add notification:', err);
    }
  },

  subscribeToNotifications: (userId: string) => {
    const channel = supabase
      .channel(`public:notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresInsertPayload<Notification>) => {
          const newNotif = payload.new as Notification;
          set((state) => ({ notifications: upsertNotification(state.notifications, newNotif) }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updatedNotification = payload.new as Notification;
          set((state) => ({ notifications: upsertNotification(state.notifications, updatedNotification) }));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },
}));
