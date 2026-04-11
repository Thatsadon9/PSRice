'use client';
// ==========================================
// PS Rice Wholesale — Auth Store (Supabase Auth)
// ==========================================

import { create } from 'zustand';
import type { User } from '@/lib/types';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

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
    // 1. Get current session from Supabase
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
      set({ currentUser: null, isAuthenticated: false, isLoading: false });
      return;
    }

    // 2. Fetch the public user data linked to this auth id
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (userError || !userData) {
      console.error('Failed to fetch public user metadata', userError);
      // Even if session exists, if data is missing, we consider logged out for consistent state
      set({ currentUser: null, isAuthenticated: false, isLoading: false });
      return;
    }

    set({ 
      currentUser: userData as User, 
      isAuthenticated: true, 
      isLoading: false 
    });

    // 3. Listen for auth changes (logout from other tabs, etc.)
    supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      if (event === 'SIGNED_OUT') {
        set({ currentUser: null, isAuthenticated: false, isLoading: false });
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          // Re-fetch data if needed or use previous if same user
          if (get().currentUser?.id !== session.user.id) {
             const { data } = await supabase.from('users').select('*').eq('id', session.user.id).single();
             if (data) set({ currentUser: data as User, isAuthenticated: true });
          }
        }
      }
    });
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
