'use client';
// ==========================================
// PS Rice Wholesale — Task Store (Supabase)
// ==========================================

import { create } from 'zustand';
import type { Task, TaskTemplate, TaskSubmission, SubmissionFile, TaskStatus, ReviewStatus, ChecklistItem } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { uploadFile, dataURLtoBlob, removeStoredFile } from '@/lib/storage';
import { getCurrentDateStr, isSameCalendarDate } from '@/lib/dateUtils';
import { serializeReviewFeedback } from '@/lib/reviewFeedback';
import { markReviewRequestNotificationsAsRead } from '@/lib/reviewHelpers';
import { isExpiredUnsubmittedTask, validateUnitQuantity } from '@/lib/taskMilestones';

interface SubmissionUploadInput extends Omit<SubmissionFile, 'id' | 'created_at' | 'file_url'> {
  file_url?: string;
  upload_blob?: Blob | File;
  file_name?: string;
}

type TaskInsertInput = Omit<Task, 'id' | 'created_at'>;
type AddTaskResult = { task: Task; created: boolean };

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
  updateTaskStatus: (taskId: string, status: TaskStatus, updates?: Partial<Task>) => Promise<void>;
  updateChecklist: (taskId: string, checklistState: ChecklistItem[]) => Promise<void>;
  addTask: (task: TaskInsertInput) => Promise<AddTaskResult | null>;
  deleteTask: (taskId: string) => Promise<boolean>;

  // Template actions
  getTemplateById: (templateId: string) => TaskTemplate | undefined;
  addTemplate: (template: Omit<TaskTemplate, 'id' | 'created_at'>) => Promise<boolean>;
  updateTemplate: (templateId: string, updates: Partial<TaskTemplate>) => Promise<boolean>;
  reorderTemplates: (templateIds: string[]) => Promise<boolean>;
  deleteTemplate: (templateId: string) => Promise<boolean>;

  // Submission actions
  getSubmissionsByTask: (taskId: string) => TaskSubmission[];
  getSubmissionsByUser: (userId: string) => TaskSubmission[];
  getPendingSubmissions: () => TaskSubmission[];
  addSubmission: (submission: Omit<TaskSubmission, 'id' | 'created_at' | 'submitted_at'>) => Promise<TaskSubmission | null>;
  reviewSubmission: (
    submissionId: string,
    status: ReviewStatus,
    comment: string,
    reviewedBy: string,
    rating?: number | null,
    rewardUpdates?: Pick<TaskSubmission, 'approved_quantity' | 'approved_reward_amount'>,
  ) => Promise<void>;

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

function getTemplateOrder(template: TaskTemplate) {
  return typeof template.sort_order === 'number' && Number.isFinite(template.sort_order)
    ? template.sort_order
    : Number.MAX_SAFE_INTEGER;
}

function sortTaskTemplates(items: TaskTemplate[]) {
  return [...items].sort((left, right) => {
    const orderDiff = getTemplateOrder(left) - getTemplateOrder(right);

    if (orderDiff !== 0) {
      return orderDiff;
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

function getNextTemplateSortOrder(templates: TaskTemplate[], branchId: string | null | undefined) {
  return templates
    .filter((template) => template.branch_id === (branchId ?? null))
    .reduce((maxOrder, template) => {
      const sortOrder = typeof template.sort_order === 'number' && Number.isFinite(template.sort_order)
        ? template.sort_order
        : 0;

      return Math.max(maxOrder, sortOrder);
    }, 0) + 1;
}

function sortSubmissions(items: TaskSubmission[]) {
  return [...items].sort((left, right) => {
    return new Date(right.submitted_at).getTime() - new Date(left.submitted_at).getTime();
  });
}

function upsertEntity<T extends { id: string }>(items: T[], entity: T) {
  return [entity, ...items.filter((item) => item.id !== entity.id)];
}

function isDailyTemplateTask(task: TaskInsertInput) {
  return Boolean(task.template_id && task.assigned_to && task.due_date);
}

function isDailyTemplateDuplicateError(error: { code?: string; message?: string } | null) {
  return Boolean(
    error?.code === '23505' &&
    (error.message?.includes('tasks_daily_template_assignee_due_unique') ||
      error.message?.includes('duplicate key value violates unique constraint')),
  );
}

async function findExistingDailyTemplateTask(task: TaskInsertInput) {
  if (!isDailyTemplateTask(task)) {
    return null;
  }

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('template_id', task.template_id as string)
    .eq('assigned_to', task.assigned_to)
    .eq('due_date', task.due_date)
    .maybeSingle();

  if (error) {
    console.error('Failed to find existing daily template task:', error.message || error, error);
    return null;
  }

  return data ? data as Task : null;
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

function getProofStoragePath(fileUrl: string) {
  try {
    const url = new URL(fileUrl);
    const marker = '/storage/v1/object/public/proofs/';
    const markerIndex = url.pathname.indexOf(marker);

    if (markerIndex === -1) {
      return null;
    }

    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

async function getProofStoragePathsForTask(taskId: string) {
  const { data: submissions, error: submissionsError } = await supabase
    .from('task_submissions')
    .select('id')
    .eq('task_id', taskId);

  if (submissionsError) {
    console.error('Failed to load task submissions before deletion:', submissionsError.message || submissionsError, submissionsError);
    return [];
  }

  const submissionIds = (submissions || []).map((submission) => submission.id);

  if (submissionIds.length === 0) {
    return [];
  }

  const { data: files, error: filesError } = await supabase
    .from('submission_files')
    .select('file_url')
    .in('submission_id', submissionIds);

  if (filesError) {
    console.error('Failed to load submission files before deletion:', filesError.message || filesError, filesError);
    return [];
  }

  return Array.from(new Set(
    (files || [])
      .map((file) => getProofStoragePath(file.file_url))
      .filter((path): path is string => Boolean(path))
  ));
}

function isVisibleTask(task: Task) {
  return !isExpiredUnsubmittedTask(task, getCurrentDateStr());
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
        tasks: sortByCreatedAtDesc(((resTasks.data || []) as Task[]).filter(isVisibleTask)),
        templates: sortTaskTemplates((resTemplates.data || []) as TaskTemplate[]),
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
            templates: sortTaskTemplates(upsertEntity(state.templates, template)),
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
          if (!isVisibleTask(task)) {
            set((state) => ({
              tasks: state.tasks.filter((item) => item.id !== task.id),
            }));
            return;
          }

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
    return get().tasks.filter(t => t.assigned_to === userId && isVisibleTask(t));
  },

  getTodayTasksByUser: (userId: string) => {
    const today = getCurrentDateStr();
    return get().tasks.filter((task) => task.assigned_to === userId && isVisibleTask(task) && isSameCalendarDate(task.due_date, today));
  },

  getTaskById: (taskId: string) => {
    const task = get().tasks.find(t => t.id === taskId);
    return task && isVisibleTask(task) ? task : undefined;
  },

  updateTaskStatus: async (taskId: string, status: TaskStatus, updates: Partial<Task> = {}) => {
    const payload = { ...updates, status };
    await supabase.from('tasks').update(payload).eq('id', taskId);
    set(state => ({
      tasks: state.tasks.map(t => t.id === taskId ? { ...t, ...payload } : t),
    }));
  },

  updateChecklist: async (taskId: string, checklistState: ChecklistItem[]) => {
    await supabase.from('tasks').update({ checklist_state: checklistState }).eq('id', taskId);
    set(state => ({
      tasks: state.tasks.map(t => t.id === taskId ? { ...t, checklist_state: checklistState } : t),
    }));
  },

  addTask: async (task) => {
    const existingTask = await findExistingDailyTemplateTask(task);
    if (existingTask) {
      set((state) => ({ tasks: sortByCreatedAtDesc(upsertEntity(state.tasks, existingTask)) }));
      return { task: existingTask, created: false };
    }

    const { data, error } = await supabase.from('tasks').insert(task).select().single();
    if (error) {
      if (isDailyTemplateDuplicateError(error)) {
        const duplicateTask = await findExistingDailyTemplateTask(task);
        if (duplicateTask) {
          set((state) => ({ tasks: sortByCreatedAtDesc(upsertEntity(state.tasks, duplicateTask)) }));
          return { task: duplicateTask, created: false };
        }
      }

      console.error('Failed to add task:', error.message || error, error);
      return null;
    }
    if (data) {
      const newTask = data as Task;
      set((state) => ({ tasks: sortByCreatedAtDesc(upsertEntity(state.tasks, newTask)) }));
      return { task: newTask, created: true };
    }
    return null;
  },

  deleteTask: async (taskId: string) => {
    const proofStoragePaths = await getProofStoragePathsForTask(taskId);

    const { data, error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId)
      .select('id')
      .single();

    if (error) {
      console.error('Failed to delete task:', error.message || error, error);
      return false;
    }

    if (!data) {
      return false;
    }

    if (proofStoragePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('proofs')
        .remove(proofStoragePaths);

      if (storageError) {
        console.error('Failed to delete proof files from storage:', storageError.message || storageError, storageError);
      }
    }

    set((state) => {
      const removedSubmissionIds = new Set(
        state.submissions
          .filter((submission) => submission.task_id === taskId)
          .map((submission) => submission.id)
      );

      return {
        tasks: state.tasks.filter((task) => task.id !== taskId),
        submissions: state.submissions.filter((submission) => submission.task_id !== taskId),
        submissionFiles: state.submissionFiles.filter((file) => !removedSubmissionIds.has(file.submission_id)),
      };
    });

    return true;
  },

  // Template actions
  getTemplateById: (templateId: string) => {
    return get().templates.find(t => t.id === templateId);
  },

  addTemplate: async (template) => {
    const sortOrder = template.sort_order ?? getNextTemplateSortOrder(get().templates, template.branch_id);

    // We omit created_at but let Postgres handle it via DEFAULT
    const { data, error } = await supabase
      .from('task_templates')
      .insert({ ...template, sort_order: sortOrder })
      .select()
      .single();
    if (error) {
      console.error('Failed to add task template:', error.message || error, error);
      return false;
    }
    if (data) {
      set(state => ({ templates: sortTaskTemplates(upsertEntity(state.templates, data as TaskTemplate)) }));
      return true;
    }
    return false;
  },

  updateTemplate: async (templateId: string, updates: Partial<TaskTemplate>) => {
    const { data, error } = await supabase.from('task_templates').update(updates).eq('id', templateId).select().single();
    if (error) {
      console.error('Failed to update task template:', error.message || error, error);
      return false;
    }
    if (data) {
      set(state => ({
        templates: sortTaskTemplates(upsertEntity(state.templates, data as TaskTemplate)),
      }));
      return true;
    }
    return false;
  },

  reorderTemplates: async (templateIds) => {
    if (templateIds.length === 0) {
      return true;
    }

    const previousTemplates = get().templates;
    const orderById = new Map(templateIds.map((templateId, index) => [templateId, index + 1]));
    const nextTemplates = sortTaskTemplates(
      previousTemplates.map((template) => {
        const nextOrder = orderById.get(template.id);

        return nextOrder ? { ...template, sort_order: nextOrder } : template;
      })
    );

    set({ templates: nextTemplates });

    const results = await Promise.all(
      templateIds.map((templateId, index) => (
        supabase
          .from('task_templates')
          .update({ sort_order: index + 1 })
          .eq('id', templateId)
      ))
    );
    const failedResult = results.find((result) => result.error);

    if (failedResult?.error) {
      console.error('Failed to reorder task templates:', failedResult.error.message || failedResult.error, failedResult.error);
      set({ templates: previousTemplates });
      return false;
    }

    return true;
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
    const task = get().tasks.find((item) => item.id === submission.task_id);
    const template = task?.template_id
      ? get().templates.find((item) => item.id === task.template_id) ?? null
      : null;
    const submittedQuantityValidation = validateUnitQuantity(submission.submitted_quantity, task, template);
    if (!submittedQuantityValidation.valid) {
      console.error('Invalid unit task submitted quantity:', submittedQuantityValidation.message);
      return null;
    }

    if (submission.approved_quantity !== null && submission.approved_quantity !== undefined) {
      const approvedQuantityValidation = validateUnitQuantity(submission.approved_quantity, task, template);
      if (!approvedQuantityValidation.valid) {
        console.error('Invalid unit task approved quantity:', approvedQuantityValidation.message);
        return null;
      }
    }

    const { data, error } = await supabase.from('task_submissions').insert(submission).select().single();
    if (data && !error) {
       const newSub = data as TaskSubmission;
       set((state) => ({ submissions: sortSubmissions(upsertEntity(state.submissions, newSub)) }));
       return newSub;
    }
    return null;
  },

  reviewSubmission: async (
    submissionId: string,
    status: ReviewStatus,
    comment: string,
    reviewedBy: string,
    rating?: number | null,
    rewardUpdates?: Pick<TaskSubmission, 'approved_quantity' | 'approved_reward_amount'>,
  ) => {
    const reviewedAt = new Date().toISOString();
    const reviewComment = serializeReviewFeedback(comment, rating);
    const existingSubmission = get().submissions.find((submission) => submission.id === submissionId);
    const task = existingSubmission
      ? get().tasks.find((item) => item.id === existingSubmission.task_id)
      : undefined;
    const template = task?.template_id
      ? get().templates.find((item) => item.id === task.template_id) ?? null
      : null;

    if (status === 'approved' && rewardUpdates?.approved_quantity !== null && rewardUpdates?.approved_quantity !== undefined) {
      const approvedQuantityValidation = validateUnitQuantity(rewardUpdates.approved_quantity, task, template);
      if (!approvedQuantityValidation.valid) {
        console.error('Invalid unit task approved quantity:', approvedQuantityValidation.message);
        throw new Error(approvedQuantityValidation.message || 'Invalid approved quantity');
      }
    }

    const payload: Partial<TaskSubmission> = {
       review_status: status,
       review_comment: reviewComment,
       review_rating: rating ?? null,
       reviewed_by: reviewedBy,
       reviewed_at: reviewedAt,
       approved_quantity: status === 'approved' ? rewardUpdates?.approved_quantity ?? null : null,
       approved_reward_amount: status === 'approved' ? rewardUpdates?.approved_reward_amount ?? null : null,
    };
    const { error } = await supabase.from('task_submissions').update(payload).eq('id', submissionId);

    if (error) {
      throw new Error(error.message || 'Failed to review submission');
    }

    try {
      await markReviewRequestNotificationsAsRead(submissionId);
    } catch (err) {
      console.error('Failed to sync review request notifications:', err);
    }

    set(state => ({
      submissions: state.submissions.map(s =>
        s.id === submissionId
          ? {
              ...s,
              ...payload,
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
    let newlyUploadedUrl: string | null = null;

    try {
      let finalFileUrl = file.file_url || '';

      if (file.upload_blob) {
        const uploadedUrl = await uploadFile('proofs', buildUploadPath(file), file.upload_blob);
        if (uploadedUrl) {
          finalFileUrl = uploadedUrl;
          newlyUploadedUrl = uploadedUrl;
        }
      } else if (file.file_url?.startsWith('data:')) {
        const blob = dataURLtoBlob(file.file_url);
        const uploadedUrl = await uploadFile('proofs', buildUploadPath({ ...file, upload_blob: blob }), blob);
        if (uploadedUrl) {
          finalFileUrl = uploadedUrl;
          newlyUploadedUrl = uploadedUrl;
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
      if (newlyUploadedUrl) {
        await removeStoredFile('proofs', newlyUploadedUrl);
      }
      console.error('Failed to add submission file:', err);
    }
  },

  // Stats
  getTaskStats: (userId?: string) => {
    let tasks = get().tasks.filter(isVisibleTask);
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
