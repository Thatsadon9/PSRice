'use client';
// ==========================================
// PS Rice Wholesale — Auth Store (Supabase Auth)
// ==========================================

import { create } from 'zustand';
import type { User } from '@/lib/types';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

let authListenerRegistered = false;

async function clearInvalidSession() {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (error) {
    console.warn('Failed to clear invalid local auth session', error);
  }
}

async function fetchUserProfile(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as User;
}

async function getInactiveAccountMessage(email: string) {
  const { data } = await supabase
    .from('registration_requests')
    .select('status, review_note')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return 'บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าใช้งาน';
  }

  if (data.status === 'rejected') {
    const reviewNote = typeof data.review_note === 'string' && data.review_note.trim()
      ? ` หมายเหตุ: ${data.review_note.trim()}`
      : '';
    return `คำขอสมัครยังไม่ได้รับอนุมัติ${reviewNote}`;
  }

  return 'บัญชีนี้กำลังรอผู้จัดการหรือแอดมินอนุมัติก่อนเข้าใช้งาน';
}

interface LoginResult {
  success: boolean;
  message?: string;
}

interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Transitions
  initialize: () => Promise<void>;
  refreshCurrentUser: (userId?: string) => Promise<void>;
  subscribeToCurrentUserProfile: (userId: string) => () => void;
  login: (email: string, password?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  isAuthenticated: false,
  isLoading: true, // Start as loading to prevent flash of login page

  initialize: async () => {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        if (error.message.toLowerCase().includes('refresh token')) {
          await clearInvalidSession();
        } else {
          console.error('Failed to restore auth session', error);
        }

        set({ currentUser: null, isAuthenticated: false, isLoading: false });
        return;
      }

      if (!session) {
        set({ currentUser: null, isAuthenticated: false, isLoading: false });
        return;
      }

      const userData = await fetchUserProfile(session.user.id);

      if (!userData) {
        console.error('Failed to fetch public user metadata for active session');
        await clearInvalidSession();
        set({ currentUser: null, isAuthenticated: false, isLoading: false });
        return;
      }

      if (userData.status !== 'active') {
        await clearInvalidSession();
        set({ currentUser: null, isAuthenticated: false, isLoading: false });
        return;
      }

      set({
        currentUser: userData,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown auth restore error';

      if (message.toLowerCase().includes('refresh token')) {
        await clearInvalidSession();
      } else {
        console.error('Unexpected auth restore error', error);
      }

      set({ currentUser: null, isAuthenticated: false, isLoading: false });
      return;
    }

    if (!authListenerRegistered) {
      authListenerRegistered = true;

      supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
        if (event === 'SIGNED_OUT') {
          set({ currentUser: null, isAuthenticated: false, isLoading: false });
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            if (get().currentUser?.id !== session.user.id) {
              setTimeout(() => {
                void get().refreshCurrentUser(session.user.id);
              }, 0);
            } else {
              set({ isAuthenticated: true, isLoading: false });
            }
          }
        } else if (event === 'INITIAL_SESSION' && !session) {
          // No valid session on app start – ensure state is clean
          set({ currentUser: null, isAuthenticated: false, isLoading: false });
        }
      });

      // Periodically verify the session is still valid (catches silent refresh failures)
      const SESSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
      setInterval(() => {
        void (async () => {
          const { data: { session: s }, error } = await supabase.auth.getSession();
          if (error || !s) {
            if (get().isAuthenticated) {
              console.warn('Session expired or refresh failed, logging out');
              await clearInvalidSession();
              set({ currentUser: null, isAuthenticated: false, isLoading: false });
            }
          }
        })();
      }, SESSION_CHECK_INTERVAL);
    }
  },

  refreshCurrentUser: async (userId) => {
    const targetUserId = userId || get().currentUser?.id;

    if (!targetUserId) {
      return;
    }

    const userData = await fetchUserProfile(targetUserId);

    if (!userData || userData.status !== 'active') {
      await clearInvalidSession();
      set({ currentUser: null, isAuthenticated: false, isLoading: false });
      return;
    }

    set({
      currentUser: userData,
      isAuthenticated: true,
      isLoading: false,
    });
  },

  subscribeToCurrentUserProfile: (userId) => {
    const channel = supabase
      .channel(`public:current-user:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const nextUser = payload.new as User;

          if (nextUser.status !== 'active') {
            void clearInvalidSession();
            set({ currentUser: null, isAuthenticated: false, isLoading: false });
            return;
          }

          set({
            currentUser: nextUser,
            isAuthenticated: true,
            isLoading: false,
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${userId}`,
        },
        () => {
          void clearInvalidSession();
          set({ currentUser: null, isAuthenticated: false, isLoading: false });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },

  login: async (email: string, password?: string) => {
    // Avoid toggling AuthProvider's global `isLoading` (session bootstrap); it would unmount /login UI.
    try {
      // 1. Authenticate with Supabase Auth
      // Note: For Phase 3, we expect the user to have accounts in auth.users
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: password || '', 
      });

      if (error || !data.user) {
        return {
          success: false,
          message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
        };
      }

      // 2. Fetch linked public user data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (userError || !userData) {
        await clearInvalidSession();
        return {
          success: false,
          message: 'ไม่พบบัญชีผู้ใช้ในระบบ',
        };
      }

      if ((userData as User).status !== 'active') {
        const message = await getInactiveAccountMessage(email);
        await clearInvalidSession();
        set({ currentUser: null, isAuthenticated: false, isLoading: false });
        return {
          success: false,
          message,
        };
      }

      set({ 
        currentUser: userData as User, 
        isAuthenticated: true, 
        isLoading: false 
      });
      return { success: true };
    } catch {
      return {
        success: false,
        message: 'ไม่สามารถเข้าสู่ระบบได้ในขณะนี้',
      };
    }
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ currentUser: null, isAuthenticated: false, isLoading: false });
  },
}));
