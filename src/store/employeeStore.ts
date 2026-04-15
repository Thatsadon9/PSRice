'use client';
// ==========================================
// PS Rice Wholesale — Employee Store (Supabase)
// ==========================================

import { create } from 'zustand';
import type { User } from '@/lib/types';
import { getAccessToken, supabase } from '@/lib/supabase';

interface EmployeeState {
  users: User[];
  isLoading: boolean;
  fetchUsers: () => Promise<void>;
  subscribeToUserUpdates: () => () => void;
  getUserById: (id: string) => User | undefined;
  getUsersByBranch: (branchId: string) => User[];
  getUsersByRole: (role: string) => User[];
  getEmployees: () => User[];
  addUser: (user: Omit<User, 'id' | 'created_at'>, password?: string) => Promise<boolean>;
  updateUser: (userId: string, updates: Partial<User>) => Promise<boolean>;
}

function sortUsers(users: User[]) {
  return [...users].sort((left, right) => {
    const nameCompare = left.full_name.localeCompare(right.full_name, 'th');
    if (nameCompare !== 0) {
      return nameCompare;
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

function upsertUser(users: User[], user: User) {
  return sortUsers([user, ...users.filter((item) => item.id !== user.id)]);
}

export const useEmployeeStore = create<EmployeeState>((set, get) => ({
  users: [],
  isLoading: false,

  fetchUsers: async () => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.from('users').select('*');
      if (error) throw error;
      set({ users: sortUsers((data || []) as User[]), isLoading: false });
    } catch (err) {
      console.error('Failed to fetch users:', err);
      set({ isLoading: false });
    }
  },

  subscribeToUserUpdates: () => {
    const channel = supabase
      .channel('public:users')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = String(payload.old.id);
            set((state) => ({
              users: state.users.filter((user) => user.id !== deletedId),
            }));
            return;
          }

          const user = payload.new as User;
          set((state) => ({
            users: upsertUser(state.users, user),
          }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },

  getUserById: (id: string) => {
    return get().users.find(u => u.id === id);
  },

  getUsersByBranch: (branchId: string) => {
    return get().users.filter(u => u.branch_id === branchId);
  },

  getUsersByRole: (role: string) => {
    return get().users.filter(u => u.role === role);
  },

  getEmployees: () => {
    return get().users.filter(u => u.role === 'employee');
  },

  addUser: async (user: Omit<User, 'id' | 'created_at'>, password?: string) => {
    set({ isLoading: true });
    try {
      // If we have a password, we call our custom API to create both Auth and Profile
      if (password) {
        const accessToken = await getAccessToken();
        const response = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ ...user, password })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error);

        // Fetch users again to get the newly created user (or we could manually add it)
        await get().fetchUsers();
        return true;
      }

      // Fallback to direct insertion if no password (though we'd usually want a password now)
      const { data, error } = await supabase.from('users').insert(user).select().single();
      if (error) throw error;
      set(state => ({ users: upsertUser(state.users, data as User), isLoading: false }));
      return true;
    } catch (err) {
      console.error('Add user error:', err instanceof Error ? err.message : err);
      set({ isLoading: false });
      return false;
    }
  },

  updateUser: async (userId: string, updates: Partial<User>) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.from('users').update(updates).eq('id', userId).select().single();
      if (error) throw error;
      set(state => ({
        users: upsertUser(state.users, data as User),
        isLoading: false,
      }));
      return true;
    } catch (err) {
      console.error('Update user error:', err);
      set({ isLoading: false });
      return false;
    }
  },
}));
