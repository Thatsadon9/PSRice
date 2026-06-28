'use client';

import { create } from 'zustand';
import type {
  ApprovalStatus,
  BranchAttendancePolicy,
  CompensationProfile,
  EmployeeRequest,
  EmployeeRequestType,
  RegistrationRequest,
  ShiftAssignment,
  ShiftTemplate,
} from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { normalizeTimeValue, toNumberValue } from '@/lib/hr';

type AppSettingValue =
  | string
  | number
  | boolean
  | null
  | AppSettingValue[]
  | { [key: string]: AppSettingValue };

interface HrState {
  branchPolicies: BranchAttendancePolicy[];
  shiftTemplates: ShiftTemplate[];
  shiftAssignments: ShiftAssignment[];
  compensationProfiles: CompensationProfile[];
  employeeRequests: EmployeeRequest[];
  registrationRequests: RegistrationRequest[];
  appSettings: Record<string, AppSettingValue>;
  isLoading: boolean;
  schemaReady: boolean;
  schemaMessage: string | null;
  fetchInitialData: () => Promise<void>;
  updateGlobalSetting: (key: string, value: AppSettingValue) => Promise<boolean>;
  subscribeToHrUpdates: () => () => void;
  getBranchPolicy: (branchId?: string | null) => BranchAttendancePolicy | undefined;
  upsertBranchPolicy: (
    branchId: string,
    updates: Partial<Omit<BranchAttendancePolicy, 'id' | 'branch_id' | 'created_at' | 'updated_at'>>,
  ) => Promise<boolean>;
  getShiftTemplatesByBranch: (branchId?: string | null) => ShiftTemplate[];
  addShiftTemplate: (template: Omit<ShiftTemplate, 'id' | 'created_at' | 'updated_at'>) => Promise<boolean>;
  updateShiftTemplate: (templateId: string, updates: Partial<ShiftTemplate>) => Promise<boolean>;
  deleteShiftTemplate: (templateId: string) => Promise<boolean>;
  getAssignmentsByUser: (userId: string) => ShiftAssignment[];
  getAssignmentsForDate: (workDate: string) => ShiftAssignment[];
  getAssignmentForUserOnDate: (userId: string, workDate: string) => ShiftAssignment | undefined;
  upsertShiftAssignment: (
    assignment: Omit<ShiftAssignment, 'id' | 'created_at' | 'updated_at'> & { id?: string },
  ) => Promise<boolean>;
  deleteShiftAssignment: (assignmentId: string) => Promise<boolean>;
  getCompensationProfile: (userId: string) => CompensationProfile | undefined;
  upsertCompensationProfile: (
    profile: Omit<CompensationProfile, 'id' | 'created_at' | 'updated_at'> & { id?: string },
  ) => Promise<boolean>;
  getEmployeeRequestsByUser: (userId: string) => EmployeeRequest[];
  addEmployeeRequest: (
    request: Omit<EmployeeRequest, 'id' | 'created_at' | 'updated_at' | 'reviewed_at' | 'reviewed_by'>,
  ) => Promise<boolean>;
  reviewEmployeeRequest: (
    requestId: string,
    status: ApprovalStatus,
    reviewedBy: string,
    reviewNote?: string,
  ) => Promise<boolean>;
  addRegistrationRequest: (
    request: Omit<RegistrationRequest, 'id' | 'created_at' | 'updated_at' | 'reviewed_at' | 'reviewed_by'>,
  ) => Promise<boolean>;
  reviewRegistrationRequest: (
    requestId: string,
    status: ApprovalStatus,
    reviewedBy: string,
    reviewNote?: string,
    overrides?: {
      branch_id?: string | null;
      team_id?: string | null;
    },
  ) => Promise<boolean>;
}

function isMissingRelationError(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  return error.code === '42P01' || error.message?.toLowerCase().includes('does not exist') || false;
}

function mapBranchPolicy(record: Record<string, unknown>): BranchAttendancePolicy {
  return {
    id: String(record.id),
    branch_id: String(record.branch_id),
    shift_start_time: normalizeTimeValue(String(record.shift_start_time || '08:30')),
    shift_end_time: normalizeTimeValue(String(record.shift_end_time || '17:30')),
    break_minutes: toNumberValue(record.break_minutes, 60),
    late_grace_minutes: toNumberValue(record.late_grace_minutes, 15),
    early_out_grace_minutes: toNumberValue(record.early_out_grace_minutes, 0),
    minimum_ot_minutes: toNumberValue(record.minimum_ot_minutes, 30),
    check_in_reward: toNumberValue(record.check_in_reward, 50),
    use_default_check_in_reward: record.use_default_check_in_reward !== undefined ? Boolean(record.use_default_check_in_reward) : true,
    created_at: String(record.created_at || ''),
    updated_at: String(record.updated_at || record.created_at || ''),
  };
}

function mapShiftTemplate(record: Record<string, unknown>): ShiftTemplate {
  return {
    id: String(record.id),
    branch_id: record.branch_id ? String(record.branch_id) : null,
    name: String(record.name || ''),
    code: record.code ? String(record.code) : null,
    color: String(record.color || '#0f766e'),
    start_time: normalizeTimeValue(String(record.start_time || '08:30')),
    end_time: normalizeTimeValue(String(record.end_time || '17:30')),
    break_minutes: toNumberValue(record.break_minutes, 60),
    late_grace_minutes: toNumberValue(record.late_grace_minutes, 15),
    early_out_grace_minutes: toNumberValue(record.early_out_grace_minutes, 0),
    minimum_ot_minutes: toNumberValue(record.minimum_ot_minutes, 30),
    is_active: Boolean(record.is_active ?? true),
    created_at: String(record.created_at || ''),
    updated_at: String(record.updated_at || record.created_at || ''),
  };
}

function mapShiftAssignment(record: Record<string, unknown>): ShiftAssignment {
  return {
    id: String(record.id),
    user_id: String(record.user_id),
    branch_id: record.branch_id ? String(record.branch_id) : null,
    shift_template_id: record.shift_template_id ? String(record.shift_template_id) : null,
    work_date: String(record.work_date || ''),
    shift_name: String(record.shift_name || ''),
    start_time: normalizeTimeValue(String(record.start_time || '08:30')),
    end_time: normalizeTimeValue(String(record.end_time || '17:30')),
    break_minutes: toNumberValue(record.break_minutes, 60),
    late_grace_minutes: toNumberValue(record.late_grace_minutes, 15),
    early_out_grace_minutes: toNumberValue(record.early_out_grace_minutes, 0),
    minimum_ot_minutes: toNumberValue(record.minimum_ot_minutes, 30),
    status: String(record.status || 'scheduled') as ShiftAssignment['status'],
    notes: record.notes ? String(record.notes) : null,
    created_by: record.created_by ? String(record.created_by) : null,
    created_at: String(record.created_at || ''),
    updated_at: String(record.updated_at || record.created_at || ''),
  };
}

function mapCompensationProfile(record: Record<string, unknown>): CompensationProfile {
  return {
    id: String(record.id),
    user_id: String(record.user_id),
    pay_type: String(record.pay_type || 'daily') as CompensationProfile['pay_type'],
    base_rate: toNumberValue(record.base_rate, 0),
    ot_rate: toNumberValue(record.ot_rate, 0),
    late_deduction_rate: toNumberValue(record.late_deduction_rate, 0),
    absence_deduction_rate: toNumberValue(record.absence_deduction_rate, 0),
    leave_deduction_rate: toNumberValue(record.leave_deduction_rate, 0),
    created_at: String(record.created_at || ''),
    updated_at: String(record.updated_at || record.created_at || ''),
  };
}

function mapEmployeeRequest(record: Record<string, unknown>): EmployeeRequest {
  const attachmentUrls = Array.isArray(record.attachment_urls)
    ? record.attachment_urls.map((item) => String(item))
    : [];

  return {
    id: String(record.id),
    user_id: String(record.user_id),
    branch_id: record.branch_id ? String(record.branch_id) : null,
    request_type: String(record.request_type || 'leave') as EmployeeRequestType,
    status: String(record.status || 'pending') as ApprovalStatus,
    title: String(record.title || ''),
    description: record.description ? String(record.description) : null,
    amount: record.amount === null || record.amount === undefined ? null : toNumberValue(record.amount, 0),
    start_date: record.start_date ? String(record.start_date) : null,
    end_date: record.end_date ? String(record.end_date) : null,
    attachment_urls: attachmentUrls,
    reviewed_by: record.reviewed_by ? String(record.reviewed_by) : null,
    reviewed_at: record.reviewed_at ? String(record.reviewed_at) : null,
    review_note: record.review_note ? String(record.review_note) : null,
    created_at: String(record.created_at || ''),
    updated_at: String(record.updated_at || record.created_at || ''),
  };
}

function mapRegistrationRequest(record: Record<string, unknown>): RegistrationRequest {
  return {
    id: String(record.id),
    full_name: String(record.full_name || ''),
    email: String(record.email || ''),
    phone: String(record.phone || ''),
    desired_branch_id: record.desired_branch_id ? String(record.desired_branch_id) : null,
    team_id: record.team_id ? String(record.team_id) : null,
    note: record.note ? String(record.note) : null,
    status: String(record.status || 'pending') as ApprovalStatus,
    reviewed_by: record.reviewed_by ? String(record.reviewed_by) : null,
    reviewed_at: record.reviewed_at ? String(record.reviewed_at) : null,
    review_note: record.review_note ? String(record.review_note) : null,
    created_at: String(record.created_at || ''),
    updated_at: String(record.updated_at || record.created_at || ''),
  };
}

function sortByDateDesc<T extends { created_at: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

function sortShiftAssignments(assignments: ShiftAssignment[]) {
  return [...assignments].sort((left, right) => {
    const workDateCompare = right.work_date.localeCompare(left.work_date);
    if (workDateCompare !== 0) {
      return workDateCompare;
    }

    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
  });
}

function upsertEntity<T extends { id: string }>(items: T[], entity: T) {
  return [entity, ...items.filter((item) => item.id !== entity.id)];
}

export const useHrStore = create<HrState>((set, get) => ({
  branchPolicies: [],
  shiftTemplates: [],
  shiftAssignments: [],
  compensationProfiles: [],
  employeeRequests: [],
  registrationRequests: [],
  appSettings: {},
  isLoading: false,
  schemaReady: true,
  schemaMessage: null,

  fetchInitialData: async () => {
    set({ isLoading: true });

    const [
      branchPolicyResult,
      shiftTemplateResult,
      shiftAssignmentResult,
      compensationResult,
      employeeRequestResult,
      registrationRequestResult,
      appSettingsResult,
    ] = await Promise.all([
      supabase.from('branch_attendance_policies').select('*').order('created_at', { ascending: false }),
      supabase.from('shift_templates').select('*').order('created_at', { ascending: false }),
      supabase.from('employee_shift_assignments').select('*').order('work_date', { ascending: false }),
      supabase.from('compensation_profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('employee_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('registration_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('app_settings').select('*'),
    ]);

    const missingSchema = [
      branchPolicyResult.error,
      shiftTemplateResult.error,
      shiftAssignmentResult.error,
      compensationResult.error,
      employeeRequestResult.error,
      registrationRequestResult.error,
    ].some((error) => isMissingRelationError(error));

    if (!missingSchema) {
      [
        branchPolicyResult.error,
        shiftTemplateResult.error,
        shiftAssignmentResult.error,
        compensationResult.error,
        employeeRequestResult.error,
        registrationRequestResult.error,
      ].forEach((error) => {
        if (error) {
          console.error('HR fetch error:', error.message);
        }
      });
    }

    const parsedSettings: Record<string, AppSettingValue> = {};
    if (appSettingsResult.data) {
      (appSettingsResult.data as Array<{ key: string; value: AppSettingValue }>).forEach((row) => {
        parsedSettings[row.key] = row.value;
      });
    }

    set({
      branchPolicies: branchPolicyResult.data ? sortByDateDesc((branchPolicyResult.data as Record<string, unknown>[]).map(mapBranchPolicy)) : [],
      shiftTemplates: shiftTemplateResult.data ? sortByDateDesc((shiftTemplateResult.data as Record<string, unknown>[]).map(mapShiftTemplate)) : [],
      shiftAssignments: shiftAssignmentResult.data ? sortShiftAssignments((shiftAssignmentResult.data as Record<string, unknown>[]).map(mapShiftAssignment)) : [],
      compensationProfiles: compensationResult.data ? sortByDateDesc((compensationResult.data as Record<string, unknown>[]).map(mapCompensationProfile)) : [],
      employeeRequests: employeeRequestResult.data ? sortByDateDesc((employeeRequestResult.data as Record<string, unknown>[]).map(mapEmployeeRequest)) : [],
      registrationRequests: registrationRequestResult.data ? sortByDateDesc((registrationRequestResult.data as Record<string, unknown>[]).map(mapRegistrationRequest)) : [],
      appSettings: parsedSettings,
      isLoading: false,
      schemaReady: !missingSchema,
      schemaMessage: missingSchema
        ? 'ยังไม่พบตาราง HR เพิ่มเติมใน Supabase กรุณารัน SQL migration รอบใหม่ก่อน'
        : null,
    });
  },

  updateGlobalSetting: async (key: string, value: AppSettingValue) => {
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() });
    
    if (error) {
      console.error('Failed to update global setting:', error);
      return false;
    }
    
    set((state) => ({
      appSettings: { ...state.appSettings, [key]: value }
    }));
    return true;
  },

  subscribeToHrUpdates: () => {
    const channel = supabase
      .channel('public:hr-data')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branch_attendance_policies' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = String(payload.old.id);
            set((state) => ({
              branchPolicies: state.branchPolicies.filter((policy) => policy.id !== deletedId),
            }));
            return;
          }

          const policy = mapBranchPolicy(payload.new as Record<string, unknown>);
          set((state) => ({
            branchPolicies: sortByDateDesc(upsertEntity(state.branchPolicies, policy)),
          }));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shift_templates' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = String(payload.old.id);
            set((state) => ({
              shiftTemplates: state.shiftTemplates.filter((template) => template.id !== deletedId),
            }));
            return;
          }

          const template = mapShiftTemplate(payload.new as Record<string, unknown>);
          set((state) => ({
            shiftTemplates: sortByDateDesc(upsertEntity(state.shiftTemplates, template)),
          }));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employee_shift_assignments' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = String(payload.old.id);
            set((state) => ({
              shiftAssignments: state.shiftAssignments.filter((assignment) => assignment.id !== deletedId),
            }));
            return;
          }

          const assignment = mapShiftAssignment(payload.new as Record<string, unknown>);
          set((state) => ({
            shiftAssignments: sortShiftAssignments(upsertEntity(state.shiftAssignments, assignment)),
          }));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'compensation_profiles' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = String(payload.old.id);
            set((state) => ({
              compensationProfiles: state.compensationProfiles.filter((profile) => profile.id !== deletedId),
            }));
            return;
          }

          const profile = mapCompensationProfile(payload.new as Record<string, unknown>);
          set((state) => ({
            compensationProfiles: sortByDateDesc(upsertEntity(state.compensationProfiles, profile)),
          }));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employee_requests' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = String(payload.old.id);
            set((state) => ({
              employeeRequests: state.employeeRequests.filter((request) => request.id !== deletedId),
            }));
            return;
          }

          const request = mapEmployeeRequest(payload.new as Record<string, unknown>);
          set((state) => ({
            employeeRequests: sortByDateDesc(upsertEntity(state.employeeRequests, request)),
          }));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'registration_requests' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = String(payload.old.id);
            set((state) => ({
              registrationRequests: state.registrationRequests.filter((request) => request.id !== deletedId),
            }));
            return;
          }

          const request = mapRegistrationRequest(payload.new as Record<string, unknown>);
          set((state) => ({
            registrationRequests: sortByDateDesc(upsertEntity(state.registrationRequests, request)),
          }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },

  getBranchPolicy: (branchId) => {
    if (!branchId) {
      return undefined;
    }

    return get().branchPolicies.find((policy) => policy.branch_id === branchId);
  },

  upsertBranchPolicy: async (branchId, updates) => {
    try {
      const existing = get().getBranchPolicy(branchId);
      const payload = {
        id: existing?.id,
        branch_id: branchId,
        ...updates,
      };

      const { data, error } = await supabase
        .from('branch_attendance_policies')
        .upsert(payload, { onConflict: 'branch_id' })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const policy = mapBranchPolicy(data as Record<string, unknown>);
      set((state) => ({
        branchPolicies: sortByDateDesc(upsertEntity(state.branchPolicies, policy)),
      }));
      return true;
    } catch (error) {
      console.error('Upsert branch policy error:', error);
      return false;
    }
  },

  getShiftTemplatesByBranch: (branchId) => {
    return get().shiftTemplates.filter((template) => !branchId || template.branch_id === branchId);
  },

  addShiftTemplate: async (template) => {
    try {
      const { data, error } = await supabase
        .from('shift_templates')
        .insert(template)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const newTemplate = mapShiftTemplate(data as Record<string, unknown>);
      set((state) => ({
        shiftTemplates: sortByDateDesc(upsertEntity(state.shiftTemplates, newTemplate)),
      }));
      return true;
    } catch (error) {
      console.error('Add shift template error:', error);
      return false;
    }
  },

  updateShiftTemplate: async (templateId, updates) => {
    try {
      const { data, error } = await supabase
        .from('shift_templates')
        .update(updates)
        .eq('id', templateId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const template = mapShiftTemplate(data as Record<string, unknown>);
      set((state) => ({
        shiftTemplates: sortByDateDesc(upsertEntity(state.shiftTemplates, template)),
      }));
      return true;
    } catch (error) {
      console.error('Update shift template error:', error);
      return false;
    }
  },

  deleteShiftTemplate: async (templateId) => {
    try {
      const { error } = await supabase.from('shift_templates').delete().eq('id', templateId);
      if (error) {
        throw error;
      }

      set((state) => ({
        shiftTemplates: state.shiftTemplates.filter((item) => item.id !== templateId),
      }));
      return true;
    } catch (error) {
      console.error('Delete shift template error:', error);
      return false;
    }
  },

  getAssignmentsByUser: (userId) => {
    return get().shiftAssignments.filter((assignment) => assignment.user_id === userId);
  },

  getAssignmentsForDate: (workDate) => {
    return get().shiftAssignments.filter((assignment) => assignment.work_date === workDate);
  },

  getAssignmentForUserOnDate: (userId, workDate) => {
    return get().shiftAssignments.find((assignment) => assignment.user_id === userId && assignment.work_date === workDate);
  },

  upsertShiftAssignment: async (assignment) => {
    try {
      const payload = {
        ...assignment,
        start_time: normalizeTimeValue(assignment.start_time),
        end_time: normalizeTimeValue(assignment.end_time),
      };

      const { data, error } = await supabase
        .from('employee_shift_assignments')
        .upsert(payload, { onConflict: 'user_id,work_date' })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const mappedAssignment = mapShiftAssignment(data as Record<string, unknown>);
      set((state) => ({
        shiftAssignments: sortShiftAssignments(upsertEntity(state.shiftAssignments, mappedAssignment)),
      }));
      return true;
    } catch (error) {
      console.error('Upsert shift assignment error:', error);
      return false;
    }
  },

  deleteShiftAssignment: async (assignmentId) => {
    try {
      const { error } = await supabase.from('employee_shift_assignments').delete().eq('id', assignmentId);
      if (error) {
        throw error;
      }

      set((state) => ({
        shiftAssignments: state.shiftAssignments.filter((assignment) => assignment.id !== assignmentId),
      }));
      return true;
    } catch (error) {
      console.error('Delete shift assignment error:', error);
      return false;
    }
  },

  getCompensationProfile: (userId) => {
    return get().compensationProfiles.find((profile) => profile.user_id === userId);
  },

  upsertCompensationProfile: async (profile) => {
    try {
      const payload = {
        ...profile,
        base_rate: toNumberValue(profile.base_rate, 0),
        ot_rate: toNumberValue(profile.ot_rate, 0),
        late_deduction_rate: toNumberValue(profile.late_deduction_rate, 0),
        absence_deduction_rate: toNumberValue(profile.absence_deduction_rate, 0),
        leave_deduction_rate: toNumberValue(profile.leave_deduction_rate, 0),
      };

      const { data, error } = await supabase
        .from('compensation_profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const mappedProfile = mapCompensationProfile(data as Record<string, unknown>);
      set((state) => ({
        compensationProfiles: sortByDateDesc(upsertEntity(state.compensationProfiles, mappedProfile)),
      }));
      return true;
    } catch (error) {
      console.error('Upsert compensation profile error:', error);
      return false;
    }
  },

  getEmployeeRequestsByUser: (userId) => {
    return get().employeeRequests.filter((request) => request.user_id === userId);
  },

  addEmployeeRequest: async (request) => {
    try {
      const { data, error } = await supabase
        .from('employee_requests')
        .insert(request)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const mappedRequest = mapEmployeeRequest(data as Record<string, unknown>);
      set((state) => ({
        employeeRequests: sortByDateDesc(upsertEntity(state.employeeRequests, mappedRequest)),
      }));
      return true;
    } catch (error) {
      console.error('Add employee request error:', error);
      return false;
    }
  },

  reviewEmployeeRequest: async (requestId, status, reviewedBy, reviewNote) => {
    try {
      const { data, error } = await supabase
        .from('employee_requests')
        .update({
          status,
          reviewed_by: reviewedBy,
          reviewed_at: new Date().toISOString(),
          review_note: reviewNote || null,
        })
        .eq('id', requestId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const mappedRequest = mapEmployeeRequest(data as Record<string, unknown>);
      set((state) => ({
        employeeRequests: sortByDateDesc(upsertEntity(state.employeeRequests, mappedRequest)),
      }));
      return true;
    } catch (error) {
      console.error('Review employee request error:', error);
      return false;
    }
  },

  addRegistrationRequest: async (request) => {
    try {
      const { data, error } = await supabase
        .from('registration_requests')
        .insert(request)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const mappedRequest = mapRegistrationRequest(data as Record<string, unknown>);
      set((state) => ({
        registrationRequests: sortByDateDesc(upsertEntity(state.registrationRequests, mappedRequest)),
      }));
      return true;
    } catch (error) {
      console.error('Add registration request error:', error);
      return false;
    }
  },

  reviewRegistrationRequest: async (requestId, status, reviewedBy, reviewNote, overrides) => {
    try {
      const currentRequest = get().registrationRequests.find((request) => request.id === requestId);
      const reviewedAt = new Date().toISOString();

      const { data, error } = await supabase
        .from('registration_requests')
        .update({
          status,
          reviewed_by: reviewedBy,
          reviewed_at: reviewedAt,
          review_note: reviewNote || null,
        })
        .eq('id', requestId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (currentRequest) {
        const { data: linkedUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', currentRequest.email)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (linkedUser?.id) {
          const userUpdates: Record<string, unknown> = {
            full_name: currentRequest.full_name,
            phone: currentRequest.phone,
            branch_id: overrides?.branch_id ?? currentRequest.desired_branch_id ?? null,
            team_id: overrides?.team_id ?? currentRequest.team_id ?? '',
          };

          if (status === 'approved') {
            userUpdates.status = 'active';
          } else if (status === 'rejected') {
            userUpdates.status = 'inactive';
          }

          const { error: updateUserError } = await supabase
            .from('users')
            .update(userUpdates)
            .eq('id', linkedUser.id);

          if (updateUserError) {
            throw updateUserError;
          }
        }
      }

      const mappedRequest = mapRegistrationRequest(data as Record<string, unknown>);
      set((state) => ({
        registrationRequests: sortByDateDesc(upsertEntity(state.registrationRequests, mappedRequest)),
      }));
      return true;
    } catch (error) {
      console.error('Review registration request error:', error);
      return false;
    }
  },
}));
