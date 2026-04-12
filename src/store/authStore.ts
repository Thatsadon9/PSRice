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

interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Transitions
  initialize: () => Promise<void>;
  login: (email: string, password?: string) => Promise<boolean>;
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
                void (async () => {
                  const userData = await fetchUserProfile(session.user.id);

                  if (userData) {
                    set({ currentUser: userData, isAuthenticated: true, isLoading: false });
                    return;
                  }

                  await clearInvalidSession();
                  set({ currentUser: null, isAuthenticated: false, isLoading: false });
                })();
              }, 0);
            } else {
              set({ isAuthenticated: true, isLoading: false });
            }
          }
        }
      });
    }
  },

  login: async (email: string, password?: string) => {
    set({ isLoading: true });
    try {
      // 1. Authenticate with Supabase Auth
      // Note: For Phase 3, we expect the user to have accounts in auth.users
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: password || '12345678', // Default fallback for demo transition
      });

      if (error || !data.user) {
        console.error('Auth error:', error?.message);
        set({ isLoading: false });
        return false;
      }

      // 2. Fetch linked public user data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (userError || !userData) {
        console.error('User meta data missing');
        set({ isLoading: false });
        return false;
      }

      set({ 
        currentUser: userData as User, 
        isAuthenticated: true, 
        isLoading: false 
      });
      return true;
    } catch (err) {
      console.error(err);
      set({ isLoading: false });
      return false;
    }
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ currentUser: null, isAuthenticated: false });
  },
}));
