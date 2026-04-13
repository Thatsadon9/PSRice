'use client';
// ==========================================
// PS Rice Wholesale — Task Store (Supabase)
// ==========================================

import { create } from 'zustand';
import type { Task, TaskTemplate, TaskSubmission, SubmissionFile, TaskStatus, ReviewStatus, ChecklistItem } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { uploadFile, dataURLtoBlob } from '@/lib/storage';
import { getCurrentDateStr, isSameCalendarDate } from '@/lib/dateUtils';
import { serializeReviewFeedback } from '@/lib/reviewFeedback';

interface SubmissionUploadInput extends Omit<SubmissionFile, 'id' | 'created_at' | 'file_url'> {
  file_url?: string;
  upload_blob?: Blob | File;
  file_name?: string;
}

interface TaskState {
  tasks: Task[];
  templates: TaskTemplate[];
  submissions: TaskSubmission[];
  submissionFiles: SubmissionFile[];
  isLoading: boolean;

  // Init
  fetchInitialData: () => Promise<void>;
  subscribeToTaskUpdates: () => () => void;

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
  reviewSubmission: (submissionId: string, status: ReviewStatus, comment: string, reviewedBy: string, rating?: number | null) => Promise<void>;

  // File actions
  getFilesBySubmission: (submissionId: string) => SubmissionFile[];
  addFile: (file: SubmissionUploadInput) => Promise<void>;

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

function sortByCreatedAtDesc<T extends { created_at: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

function sortSubmissions(items: TaskSubmission[]) {
  return [...items].sort((left, right) => {
    return new Date(right.submitted_at).getTime() - new Date(left.submitted_at).getTime();
  });
}

function upsertEntity<T extends { id: string }>(items: T[], entity: T) {
  return [entity, ...items.filter((item) => item.id !== entity.id)];
}

function buildUploadPath(file: SubmissionUploadInput) {
  const originalName = file.file_name?.replace(/[^a-zA-Z0-9._-]/g, '-') || `${Date.now()}`;
  const baseName = originalName.includes('.') ? originalName.slice(0, originalName.lastIndexOf('.')) : originalName;
  const safeBaseName = baseName || `${Date.now()}`;
  const extensionFromName = originalName.includes('.') ? originalName.split('.').pop() : null;
  const extensionFromType = file.upload_blob?.type?.split('/').pop() || (file.file_type === 'video' ? 'mp4' : 'jpg');
  const extension = extensionFromName || extensionFromType;
  return `tasks/${file.submission_id}/${Date.now()}-${safeBaseName}.${extension}`;
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
        supabase.from('tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('task_templates').select('*').order('created_at', { ascending: false }),
        supabase.from('task_submissions').select('*').order('submitted_at', { ascending: false }),
        supabase.from('submission_files').select('*').order('created_at', { ascending: false }),
      ]);

      set({
        tasks: sortByCreatedAtDesc((resTasks.data || []) as Task[]),
        templates: sortByCreatedAtDesc((resTemplates.data || []) as TaskTemplate[]),
        submissions: sortSubmissions((resSubmissions.data || []) as TaskSubmission[]),
        submissionFiles: sortByCreatedAtDesc((resFiles.data || []) as SubmissionFile[]),
        isLoading: false
      });
    } catch (err) {
      console.error('Fetch data error', err);
      set({ isLoading: false });
    }
  },

  subscribeToTaskUpdates: () => {
    const channel = supabase
      .channel('public:task-data')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_templates' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = String(payload.old.id);
            set((state) => ({
              templates: state.templates.filter((template) => template.id !== deletedId),
            }));
            return;
          }

          const template = payload.new as TaskTemplate;
          set((state) => ({
            templates: sortByCreatedAtDesc(upsertEntity(state.templates, template)),
          }));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = String(payload.old.id);
            set((state) => ({
              tasks: state.tasks.filter((task) => task.id !== deletedId),
            }));
            return;
          }

          const task = payload.new as Task;
          set((state) => ({
            tasks: sortByCreatedAtDesc(upsertEntity(state.tasks, task)),
          }));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_submissions' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = String(payload.old.id);
            set((state) => ({
              submissions: state.submissions.filter((submission) => submission.id !== deletedId),
            }));
            return;
          }

          const submission = payload.new as TaskSubmission;
          set((state) => ({
            submissions: sortSubmissions(upsertEntity(state.submissions, submission)),
          }));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'submission_files' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = String(payload.old.id);
            set((state) => ({
              submissionFiles: state.submissionFiles.filter((file) => file.id !== deletedId),
            }));
            return;
          }

          const file = payload.new as SubmissionFile;
          set((state) => ({
            submissionFiles: sortByCreatedAtDesc(upsertEntity(state.submissionFiles, file)),
          }));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },

  // Task actions
  getTasksByUser: (userId: string) => {
    return get().tasks.filter(t => t.assigned_to === userId);
  },

  getTodayTasksByUser: (userId: string) => {
    const today = getCurrentDateStr();
    return get().tasks.filter((task) => task.assigned_to === userId && isSameCalendarDate(task.due_date, today));
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
      set((state) => ({ tasks: sortByCreatedAtDesc(upsertEntity(state.tasks, data as Task)) }));
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
      set(state => ({ templates: sortByCreatedAtDesc(upsertEntity(state.templates, data as TaskTemplate)) }));
      return true;
    }
    return false;
  },

  updateTemplate: async (templateId: string, updates: Partial<TaskTemplate>) => {
    const { data } = await supabase.from('task_templates').update(updates).eq('id', templateId).select().single();
    if (data) {
      set(state => ({
        templates: sortByCreatedAtDesc(upsertEntity(state.templates, data as TaskTemplate)),
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
       set((state) => ({ submissions: sortSubmissions(upsertEntity(state.submissions, newSub)) }));
       return newSub;
    }
    return null;
  },

  reviewSubmission: async (submissionId: string, status: ReviewStatus, comment: string, reviewedBy: string, rating?: number | null) => {
    const reviewedAt = new Date().toISOString();
    const reviewComment = serializeReviewFeedback(comment, rating);
    await supabase.from('task_submissions').update({
       review_status: status,
       review_comment: reviewComment,
       reviewed_by: reviewedBy,
       reviewed_at: reviewedAt
    }).eq('id', submissionId);

    set(state => ({
      submissions: state.submissions.map(s =>
        s.id === submissionId
          ? {
              ...s,
              review_status: status,
              review_comment: reviewComment,
              review_rating: rating ?? null,
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
      let finalFileUrl = file.file_url || '';

      if (file.upload_blob) {
        const uploadedUrl = await uploadFile('proofs', buildUploadPath(file), file.upload_blob);
        if (uploadedUrl) {
          finalFileUrl = uploadedUrl;
        }
      } else if (file.file_url?.startsWith('data:')) {
        const blob = dataURLtoBlob(file.file_url);
        const uploadedUrl = await uploadFile('proofs', buildUploadPath({ ...file, upload_blob: blob }), blob);
        if (uploadedUrl) {
          finalFileUrl = uploadedUrl;
        }
      }

      if (!finalFileUrl) {
        throw new Error('Submission file upload failed');
      }

      const { data, error } = await supabase
        .from('submission_files')
        .insert({
          submission_id: file.submission_id,
          file_url: finalFileUrl,
          file_type: file.file_type,
        })
        .select()
        .single();
        
      if (error) throw error;
      set((state) => ({
        submissionFiles: sortByCreatedAtDesc(upsertEntity(state.submissionFiles, data as SubmissionFile)),
      }));
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
