'use client';
// ==========================================
// PS Rice Wholesale — Auth Store (Supabase Auth)
// ==========================================

import { create } from 'zustand';
import type { User } from '@/lib/types';
import type { AdminViewMode } from '@/lib/viewMode';
import type { PostgrestSingleResponse } from '@supabase/postgrest-js';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

let authListenerRegistered = false;
const AUTH_TIMEOUT_MS = 8000;
const ADMIN_VIEW_MODE_STORAGE_KEY = 'psrice.adminViewMode';

interface ServiceErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

function isServiceRestricted(error: ServiceErrorLike | null | undefined, status?: number) {
  const message = error?.message?.toLowerCase() || '';
  const responseStatus = status ?? error?.status;

  return responseStatus === 402
    || message.includes('exceed_storage_size_quota')
    || message.includes('service for this project is restricted')
    || message.includes('project is restricted');
}

function isTemporaryServiceFailure(error: ServiceErrorLike | null | undefined, status?: number) {
  const responseStatus = status ?? error?.status;
  const message = error?.message?.toLowerCase() || '';

  return isServiceRestricted(error, status)
    || responseStatus === 429
    || (typeof responseStatus === 'number' && responseStatus >= 500)
    || message.includes('failed to fetch')
    || message.includes('timed out');
}

function getAuthenticationErrorMessage(error: ServiceErrorLike | null | undefined) {
  const message = error?.message?.toLowerCase() || '';

  if (isServiceRestricted(error)) {
    return 'ระบบส่วนกลางถูกระงับชั่วคราวเนื่องจากพื้นที่จัดเก็บเต็ม กรุณาติดต่อผู้ดูแลระบบ';
  }

  if (error?.status === 429) {
    return 'มีการพยายามเข้าสู่ระบบถี่เกินไป กรุณารอสักครู่แล้วลองใหม่';
  }

  if (message.includes('failed to fetch')) {
    return 'ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
  }

  if (error?.code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  }

  return 'ระบบยืนยันตัวตนขัดข้องชั่วคราว กรุณาติดต่อผู้ดูแลระบบ';
}

function readStoredAdminViewMode(): AdminViewMode {
  if (typeof window === 'undefined') {
    return 'manager';
  }

  return window.localStorage.getItem(ADMIN_VIEW_MODE_STORAGE_KEY) === 'employee'
    ? 'employee'
    : 'manager';
}

function writeStoredAdminViewMode(mode: AdminViewMode) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(ADMIN_VIEW_MODE_STORAGE_KEY, mode);
}

function resolveAdminViewModeForUser(user: User | null, currentMode: AdminViewMode): AdminViewMode {
  if (user?.role !== 'admin') {
    return 'manager';
  }

  return currentMode === 'employee' ? 'employee' : readStoredAdminViewMode();
}

function withTimeout<T>(promise: PromiseLike<T>, label: string) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`${label} timed out`));
      }, AUTH_TIMEOUT_MS);
    }),
  ]);
}

async function clearInvalidSession() {
  try {
    await withTimeout(supabase.auth.signOut({ scope: 'local' }), 'Supabase signOut');
  } catch (error) {
    console.warn('Failed to clear invalid local auth session', error);
  }
}

async function fetchUserProfile(userId: string) {
  return withTimeout<PostgrestSingleResponse<User>>(
    supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single<User>(),
    'Fetch user profile',
  );
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
  adminViewMode: AdminViewMode;
  
  // Transitions
  initialize: () => Promise<void>;
  refreshCurrentUser: (userId?: string) => Promise<void>;
  subscribeToCurrentUserProfile: (userId: string) => () => void;
  setAdminViewMode: (mode: AdminViewMode) => void;
  toggleAdminViewMode: () => AdminViewMode;
  login: (email: string, password?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  isAuthenticated: false,
  isLoading: true, // Start as loading to prevent flash of login page
  adminViewMode: readStoredAdminViewMode(),

  initialize: async () => {
    try {
      const {
        data: { session },
        error,
      } = await withTimeout(supabase.auth.getSession(), 'Supabase session restore');

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

      const profileResponse = await fetchUserProfile(session.user.id);
      const userData = profileResponse.data;

      if (profileResponse.error || !userData) {
        console.error('Failed to fetch public user metadata for active session');

        if (!isTemporaryServiceFailure(profileResponse.error, profileResponse.status)) {
          await clearInvalidSession();
        }

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
        adminViewMode: resolveAdminViewModeForUser(userData, get().adminViewMode),
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

    const profileResponse = await fetchUserProfile(targetUserId);
    const userData = profileResponse.data;

    if (profileResponse.error || !userData) {
      if (!isTemporaryServiceFailure(profileResponse.error, profileResponse.status)) {
        await clearInvalidSession();
      }

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
      adminViewMode: resolveAdminViewModeForUser(userData, get().adminViewMode),
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
            adminViewMode: resolveAdminViewModeForUser(nextUser, get().adminViewMode),
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
          message: getAuthenticationErrorMessage(error),
        };
      }

      // 2. Fetch linked public user data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (userError || !userData) {
        if (!isTemporaryServiceFailure(userError)) {
          await clearInvalidSession();
        }

        return {
          success: false,
          message: isServiceRestricted(userError)
            ? 'ระบบส่วนกลางถูกระงับชั่วคราวเนื่องจากพื้นที่จัดเก็บเต็ม กรุณาติดต่อผู้ดูแลระบบ'
            : 'ไม่พบบัญชีผู้ใช้ในระบบ',
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
        isLoading: false,
        adminViewMode: resolveAdminViewModeForUser(userData as User, get().adminViewMode),
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: getAuthenticationErrorMessage(error instanceof Error ? error : undefined),
      };
    }
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ currentUser: null, isAuthenticated: false, isLoading: false });
  },

  setAdminViewMode: (mode) => {
    const user = get().currentUser;

    if (user?.role !== 'admin') {
      set({ adminViewMode: 'manager' });
      return;
    }

    writeStoredAdminViewMode(mode);
    set({ adminViewMode: mode });
  },

  toggleAdminViewMode: () => {
    const nextMode: AdminViewMode = get().adminViewMode === 'employee' ? 'manager' : 'employee';
    get().setAdminViewMode(nextMode);
    return nextMode;
  },
}));
