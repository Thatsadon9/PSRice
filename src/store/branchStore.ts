'use client';
// ==========================================
// PS Rice Wholesale — Branch Store (Supabase)
// ==========================================

import { create } from 'zustand';
import type { Branch } from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface BranchState {
  branches: Branch[];
  isLoading: boolean;
  fetchBranches: () => Promise<void>;
  subscribeToBranchUpdates: () => () => void;
  getBranchById: (id: string) => Branch | undefined;
  addBranch: (branch: Omit<Branch, 'id' | 'created_at'>) => Promise<boolean>;
  updateBranch: (branchId: string, updates: Partial<Branch>) => Promise<boolean>;
  deleteBranch: (branchId: string) => Promise<boolean>;
}

function sortBranches(branches: Branch[]) {
  return [...branches].sort((left, right) => left.name.localeCompare(right.name, 'th'));
}

function upsertBranch(branches: Branch[], branch: Branch) {
  return sortBranches([branch, ...branches.filter((item) => item.id !== branch.id)]);
}

export const useBranchStore = create<BranchState>((set, get) => ({
  branches: [],
  isLoading: false,

  fetchBranches: async () => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.from('branches').select('*');
      if (error) throw error;
      set({ branches: sortBranches((data || []) as Branch[]), isLoading: false });
    } catch (err) {
      console.error('Failed to fetch branches:', err);
      set({ isLoading: false });
    }
  },

  subscribeToBranchUpdates: () => {
    const channel = supabase
      .channel('public:branches')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branches' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = String(payload.old.id);
            set((state) => ({
              branches: state.branches.filter((branch) => branch.id !== deletedId),
            }));
            return;
          }

          const branch = payload.new as Branch;
          set((state) => ({
            branches: upsertBranch(state.branches, branch),
          }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },

  getBranchById: (id: string) => {
    return get().branches.find(b => b.id === id);
  },

  addBranch: async (branch) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.from('branches').insert(branch).select().single();
      if (error) throw error;
      set(state => ({ branches: upsertBranch(state.branches, data as Branch), isLoading: false }));
      return true;
    } catch (err) {
      console.error('Add branch error:', err);
      set({ isLoading: false });
      return false;
    }
  },

  updateBranch: async (branchId: string, updates: Partial<Branch>) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.from('branches').update(updates).eq('id', branchId).select().single();
      if (error) throw error;
      set(state => ({
        branches: upsertBranch(state.branches, data as Branch),
        isLoading: false,
      }));
      return true;
    } catch (err) {
      console.error('Update branch error:', err);
      set({ isLoading: false });
      return false;
    }
  },

  deleteBranch: async (branchId: string) => {
    set({ isLoading: true });
    try {
      const { error } = await supabase.from('branches').delete().eq('id', branchId);
      if (error) throw error;
      set(state => ({
        branches: state.branches.filter(b => b.id !== branchId),
        isLoading: false,
      }));
      return true;
    } catch (err) {
      console.error('Delete branch error:', err);
      set({ isLoading: false });
      return false;
    }
  },
}));
