'use client';
// ==========================================
// PS Rice Wholesale — Task Store (Supabase)
// ==========================================

import { create } from 'zustand';
import type { Task, TaskTemplate, TaskSubmission, SubmissionFile, TaskStatus, ReviewStatus, ChecklistItem } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { uploadFile, dataURLtoBlob } from '@/lib/storage';

interface TaskState {
  tasks: Task[];
  templates: TaskTemplate[];
  submissions: TaskSubmission[];
  submissionFiles: SubmissionFile[];
  isLoading: boolean;

  // Init
  fetchInitialData: () => Promise<void>;

  // Task actions
  getTasksByUser: (userId: string) => Task[];
  getTodayTasksByUser: (userId: string) => Task[];
  getTaskById: (taskId: string) => Task | undefined;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  updateChecklist: (taskId: string, checklistState: ChecklistItem[]) => Promise<void>;
  addTask: (task: Omit<Task, 'id' | 'created_at'>) => Promise<boolean>;

  // Template actions
  getTemplateById: (templateId: string) => TaskTemplate | undefined;
  addTemplate: (template: Omit<TaskTemplate, 'id' | 'created_at'>) => Promise<boolean>;
  updateTemplate: (templateId: string, updates: Partial<TaskTemplate>) => Promise<boolean>;
  deleteTemplate: (templateId: string) => Promise<boolean>;

  // Submission actions
  getSubmissionsByTask: (taskId: string) => TaskSubmission[];
  getSubmissionsByUser: (userId: string) => TaskSubmission[];
  getPendingSubmissions: () => TaskSubmission[];
  addSubmission: (submission: Omit<TaskSubmission, 'id' | 'created_at' | 'submitted_at'>) => Promise<TaskSubmission | null>;
  reviewSubmission: (submissionId: string, status: ReviewStatus, comment: string, reviewedBy: string) => Promise<void>;

  // File actions
  getFilesBySubmission: (submissionId: string) => SubmissionFile[];
  addFile: (file: Omit<SubmissionFile, 'id' | 'created_at'>) => Promise<void>;

  // Stats
  getTaskStats: (userId?: string) => {
    total: number;
    pending: number;
    inProgress: number;
    submitted: number;
    approved: number;
    rejected: number;
    overdue: number;
  };
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  templates: [],
  submissions: [],
  submissionFiles: [],
  isLoading: false,

  fetchInitialData: async () => {
    set({ isLoading: true });
    try {
      const [resTasks, resTemplates, resSubmissions, resFiles] = await Promise.all([
        supabase.from('tasks').select('*'),
        supabase.from('task_templates').select('*'),
        supabase.from('task_submissions').select('*'),
        supabase.from('submission_files').select('*'),
      ]);

      set({
        tasks: (resTasks.data || []) as Task[],
        templates: (resTemplates.data || []) as TaskTemplate[],
        submissions: (resSubmissions.data || []) as TaskSubmission[],
        submissionFiles: (resFiles.data || []) as SubmissionFile[],
        isLoading: false
      });
    } catch (err) {
      console.error('Fetch data error', err);
      set({ isLoading: false });
    }
  },

  // Task actions
  getTasksByUser: (userId: string) => {
    return get().tasks.filter(t => t.assigned_to === userId);
  },

  getTodayTasksByUser: (userId: string) => {
    // Note: Database dates might be timestamptz. We might need better parsing in production.
    const today = getToday();
    return get().tasks.filter(t => t.assigned_to === userId && typeof t.due_date === 'string' && t.due_date.startsWith(today));
  },

  getTaskById: (taskId: string) => {
    return get().tasks.find(t => t.id === taskId);
  },

  updateTaskStatus: async (taskId: string, status: TaskStatus) => {
    await supabase.from('tasks').update({ status }).eq('id', taskId);
    set(state => ({
      tasks: state.tasks.map(t => t.id === taskId ? { ...t, status } : t),
    }));
  },

  updateChecklist: async (taskId: string, checklistState: ChecklistItem[]) => {
    await supabase.from('tasks').update({ checklist_state: checklistState }).eq('id', taskId);
    set(state => ({
      tasks: state.tasks.map(t => t.id === taskId ? { ...t, checklist_state: checklistState } : t),
    }));
  },

  addTask: async (task) => {
    const { data } = await supabase.from('tasks').insert(task).select().single();
    if (data) {
      set(state => ({ tasks: [...state.tasks, data as Task] }));
      return true;
    }
    return false;
  },

  // Template actions
  getTemplateById: (templateId: string) => {
    return get().templates.find(t => t.id === templateId);
  },

  addTemplate: async (template) => {
    // We omit created_at but let Postgres handle it via DEFAULT
    const { data } = await supabase.from('task_templates').insert(template).select().single();
    if (data) {
      set(state => ({ templates: [...state.templates, data as TaskTemplate] }));
      return true;
    }
    return false;
  },

  updateTemplate: async (templateId: string, updates: Partial<TaskTemplate>) => {
    const { data } = await supabase.from('task_templates').update(updates).eq('id', templateId).select().single();
    if (data) {
      set(state => ({
        templates: state.templates.map(t => t.id === templateId ? { ...t, ...(data as TaskTemplate) } : t),
      }));
      return true;
    }
    return false;
  },

  deleteTemplate: async (templateId: string) => {
    await supabase.from('task_templates').delete().eq('id', templateId);
    set(state => ({
      templates: state.templates.filter(t => t.id !== templateId),
    }));
    return true;
  },

  // Submission actions
  getSubmissionsByTask: (taskId: string) => {
    return get().submissions.filter(s => s.task_id === taskId);
  },

  getSubmissionsByUser: (userId: string) => {
    return get().submissions.filter(s => s.submitted_by === userId);
  },

  getPendingSubmissions: () => {
    return get().submissions.filter(s => s.review_status === 'pending');
  },

  addSubmission: async (submission) => {
    const { data, error } = await supabase.from('task_submissions').insert(submission).select().single();
    if (data && !error) {
       const newSub = data as TaskSubmission;
       set(state => ({ submissions: [...state.submissions, newSub] }));
       return newSub;
    }
    return null;
  },

  reviewSubmission: async (submissionId: string, status: ReviewStatus, comment: string, reviewedBy: string) => {
    const reviewedAt = new Date().toISOString();
    await supabase.from('task_submissions').update({
       review_status: status,
       review_comment: comment,
       reviewed_by: reviewedBy,
       reviewed_at: reviewedAt
    }).eq('id', submissionId);

    set(state => ({
      submissions: state.submissions.map(s =>
        s.id === submissionId
          ? {
              ...s,
              review_status: status,
              review_comment: comment,
              reviewed_by: reviewedBy,
              reviewed_at: reviewedAt,
            }
          : s
      ),
    }));
  },

  // File actions
  getFilesBySubmission: (submissionId: string) => {
    return get().submissionFiles.filter(f => f.submission_id === submissionId);
  },

  addFile: async (file) => {
    try {
      let finalFileUrl = file.file_url;
      
      // If file_url is a dataURL (base64), upload it first
      if (file.file_url.startsWith('data:')) {
        const blob = dataURLtoBlob(file.file_url);
        const fileName = `${file.submission_id}/${Date.now()}.jpg`;
        const uploadedUrl = await uploadFile('proofs', `tasks/${fileName}`, blob);
        if (uploadedUrl) finalFileUrl = uploadedUrl;
      }

      const { data, error } = await supabase
        .from('submission_files')
        .insert({ ...file, file_url: finalFileUrl })
        .select()
        .single();
        
      if (error) throw error;
      set(state => ({ submissionFiles: [...state.submissionFiles, data as SubmissionFile] }));
    } catch (err) {
      console.error('Failed to add submission file:', err);
    }
  },

  // Stats
  getTaskStats: (userId?: string) => {
    let tasks = get().tasks;
    if (userId) tasks = tasks.filter(t => t.assigned_to === userId);

    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      inProgress: tasks.filter(t => t.status === 'in_progress').length,
      submitted: tasks.filter(t => t.status === 'submitted').length,
      approved: tasks.filter(t => t.status === 'approved').length,
      rejected: tasks.filter(t => t.status === 'rejected').length,
      overdue: tasks.filter(t => t.status === 'overdue').length,
    };
  },
}));
