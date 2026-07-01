import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getCurrentDateStr } from '@/lib/dateUtils';
import { getAuthenticatedRequestContext } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

const DEFAULT_CHECK_IN_REWARD = 50;
const CHECK_IN_TITLE_KEYWORD = '\u0e40\u0e0a\u0e47\u0e04\u0e2d\u0e34\u0e19';
const CHECK_IN_TASK_TITLE = 'เช็คอินเข้างาน';
const CHECK_IN_TASK_DESCRIPTION = 'เช็คอินเข้างานประจำวันให้สำเร็จ';
const CHECK_IN_REWARD_SYNC_STATUSES = ['pending', 'in_progress', 'submitted', 'approved'];

let supabaseAdminClient: SupabaseClient | null = null;

type DailyTasksInput = {
  branchId: string | null;
  workDate: string | null;
};

function getSupabaseAdmin() {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  supabaseAdminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdminClient;
}

function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return true;
  }

  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

function normalizeRewardAmount(value: unknown, fallback = DEFAULT_CHECK_IN_REWARD) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeWorkDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function readDailyTasksInputFromUrl(request: Request): DailyTasksInput {
  const { searchParams } = new URL(request.url);
  return {
    branchId: searchParams.get('branch_id'),
    workDate: normalizeWorkDate(searchParams.get('work_date')),
  };
}

async function readDailyTasksInputFromBody(request: Request): Promise<DailyTasksInput> {
  try {
    const body = (await request.json()) as { branch_id?: unknown; work_date?: unknown };
    const fallback = readDailyTasksInputFromUrl(request);
    return {
      branchId: typeof body.branch_id === 'string' ? body.branch_id : fallback.branchId,
      workDate: normalizeWorkDate(body.work_date) ?? fallback.workDate,
    };
  } catch {
    return readDailyTasksInputFromUrl(request);
  }
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const input = readDailyTasksInputFromUrl(request);
  return handleDailyTasks(input.branchId, input.workDate);
}

export async function POST(request: Request) {
  const input = await readDailyTasksInputFromBody(request);
  if (isAuthorizedCronRequest(request)) {
    return handleDailyTasks(input.branchId, input.workDate);
  }

  const requestContext = await getAuthenticatedRequestContext(request);
  if (!requestContext) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { profile } = requestContext;
  if (profile.status !== 'active' || (profile.role !== 'admin' && profile.role !== 'manager')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์สั่งรัน cron job ด้วยตนเอง' }, { status: 403 });
  }

  if (profile.role === 'manager') {
    if (input.branchId && input.branchId !== profile.branch_id) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์สั่งรันนอกสาขาของตนเอง' }, { status: 403 });
    }

    return handleDailyTasks(profile.branch_id, input.workDate);
  }

  return handleDailyTasks(input.branchId, input.workDate);
}

async function handleDailyTasks(targetBranchId: string | null = null, targetWorkDate: string | null = null) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    console.error('Missing Supabase service role credentials');
    return NextResponse.json({ error: 'Missing Supabase service role credentials' }, { status: 500 });
  }

  try {
    const { data: defaultRewardSetting, error: defaultRewardError } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'default_check_in_reward')
      .maybeSingle();
    if (defaultRewardError) throw defaultRewardError;

    const defaultCheckInReward = normalizeRewardAmount(defaultRewardSetting?.value);

    let branchPoliciesQuery = supabaseAdmin
      .from('branch_attendance_policies')
      .select('branch_id, check_in_reward, use_default_check_in_reward');
    if (targetBranchId) {
      branchPoliciesQuery = branchPoliciesQuery.eq('branch_id', targetBranchId);
    }
    const { data: policies, error: policiesError } = await branchPoliciesQuery;
    if (policiesError) throw policiesError;

    const rewardByBranchId: Record<string, number> = {};
    for (const policy of policies || []) {
      const usesDefaultReward = policy.use_default_check_in_reward !== false;
      rewardByBranchId[policy.branch_id] = usesDefaultReward
        ? defaultCheckInReward
        : normalizeRewardAmount(policy.check_in_reward, defaultCheckInReward);
    }

    let userQuery = supabaseAdmin
      .from('users')
      .select('id, branch_id, role, status')
      .eq('status', 'active')
      .in('role', ['employee', 'manager', 'admin']);
    if (targetBranchId) {
      userQuery = userQuery.eq('branch_id', targetBranchId);
    }

    const { data: users, error: usersError } = await userQuery;
    if (usersError) throw usersError;
    if (!users || users.length === 0) {
      return NextResponse.json({ message: 'No active users found', created: 0 });
    }

    const usersById = new Map(users.map((user) => [user.id, user]));
    const activeEmployees = users.filter((user) => user.role === 'employee');
    const branchEmployeeIdsMap: Record<string, string[]> = {};
    for (const employee of activeEmployees) {
      if (!branchEmployeeIdsMap[employee.branch_id]) {
        branchEmployeeIdsMap[employee.branch_id] = [];
      }
      branchEmployeeIdsMap[employee.branch_id].push(employee.id);
    }

    const todayStr = targetWorkDate ?? getCurrentDateStr();
    let syncedExistingCheckInTasks = 0;

    for (const [branchId, userIds] of Object.entries(branchEmployeeIdsMap)) {
      if (userIds.length === 0) {
        continue;
      }

      const { count, error: syncCheckInError } = await supabaseAdmin
        .from('tasks')
        .update(
          { reward_amount: rewardByBranchId[branchId] ?? defaultCheckInReward },
          { count: 'exact' },
        )
        .like('title', `%${CHECK_IN_TITLE_KEYWORD}%`)
        .in('status', CHECK_IN_REWARD_SYNC_STATUSES)
        .eq('due_date', todayStr)
        .in('assigned_to', userIds);

      if (syncCheckInError) throw syncCheckInError;
      syncedExistingCheckInTasks += count ?? 0;
    }

    const { data: existingCheckInTasks, error: existingCheckInError } = await supabaseAdmin
      .from('tasks')
      .select('assigned_to')
      .like('title', `%${CHECK_IN_TITLE_KEYWORD}%`)
      .eq('due_date', todayStr);
    if (existingCheckInError) throw existingCheckInError;

    const existingCheckInAssignees = new Set(
      (existingCheckInTasks || [])
        .map((task) => task.assigned_to)
        .filter((assignedTo): assignedTo is string => typeof assignedTo === 'string'),
    );
    const activeEmployeeIds = new Set(activeEmployees.map((employee) => employee.id));

    const newCheckInTasks = activeEmployees
      .filter((employee) => !existingCheckInAssignees.has(employee.id))
      .map((employee) => ({
        template_id: null,
        assigned_to: employee.id,
        title: CHECK_IN_TASK_TITLE,
        description: CHECK_IN_TASK_DESCRIPTION,
        priority: 'medium',
        proof_type_required: 'any',
        checklist_state: [],
        due_date: todayStr,
        status: 'pending',
        reward_amount: rewardByBranchId[employee.branch_id] ?? defaultCheckInReward,
        requires_approval: false,
      }));

    let createdCheckInTasks = 0;
    if (newCheckInTasks.length > 0) {
      const { error: insertCheckInError } = await supabaseAdmin
        .from('tasks')
        .insert(newCheckInTasks);
      if (insertCheckInError) throw insertCheckInError;
      createdCheckInTasks = newCheckInTasks.length;
    }

    let templateQuery = supabaseAdmin
      .from('task_templates')
      .select('*')
      .eq('recurrence_rule', 'daily');
    if (targetBranchId) {
      templateQuery = templateQuery.or(`branch_id.eq.${targetBranchId},branch_id.is.null`);
    }

    const { data: templates, error: templatesError } = await templateQuery;
    if (templatesError) throw templatesError;

    const dailyTemplates = (templates || []).filter((template) => {
      const title = typeof template.title === 'string' ? template.title : '';
      return !title.includes(CHECK_IN_TITLE_KEYWORD);
    });
    const skippedCheckInTemplates = (templates || []).length - dailyTemplates.length;

    const { data: existingTasks, error: existingTasksError } = await supabaseAdmin
      .from('tasks')
      .select('template_id, assigned_to')
      .eq('due_date', todayStr)
      .not('template_id', 'is', null);
    if (existingTasksError) throw existingTasksError;

    const existingSet = new Set(
      (existingTasks || []).map((task) => `${task.template_id}_${task.assigned_to}`),
    );

    const newTemplateTasks = [];
    const newNotifications = [];
    let skippedUnassignedTemplates = 0;
    let skippedInactiveAssignees = 0;
    let skippedBranchMismatch = 0;

    for (const template of dailyTemplates) {
      const branchId = typeof template.branch_id === 'string' ? template.branch_id : null;
      const assignedUserId = typeof template.assigned_to === 'string' ? template.assigned_to : '';
      const targetUserIds = assignedUserId ? [assignedUserId] : [];

      if (targetUserIds.length === 0) {
        skippedUnassignedTemplates += 1;
        continue;
      }

      for (const userId of targetUserIds) {
        const assignedUser = usersById.get(userId);
        if (!assignedUser) {
          skippedInactiveAssignees += 1;
          continue;
        }

        if (branchId && assignedUser.branch_id !== branchId) {
          skippedBranchMismatch += 1;
          continue;
        }

        const signature = `${template.id}_${userId}`;
        if (existingSet.has(signature)) {
          continue;
        }

        newTemplateTasks.push({
          template_id: template.id,
          assigned_to: userId,
          title: template.title,
          description: template.description,
          priority: template.priority,
          proof_type_required: template.proof_type_required,
          checklist_state: template.checklist_json || [],
          due_date: todayStr,
          status: 'pending',
          reward_amount: template.reward_amount,
          requires_approval: template.requires_approval ?? true,
        });

        newNotifications.push({
          user_id: userId,
          title: 'งานใหม่รายวัน',
          message: `ระบบได้มอบหมายงานรายวัน "${template.title}" ให้คุณ (กำหนดส่ง: วันนี้)`,
          type: 'task',
          link: '/employee/tasks',
        });
      }
    }

    let createdTemplateTasks = 0;
    if (newTemplateTasks.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('tasks')
        .insert(newTemplateTasks);
      if (insertError) throw insertError;
      createdTemplateTasks = newTemplateTasks.length;

      if (newNotifications.length > 0) {
        const { error: notifError } = await supabaseAdmin
          .from('notifications')
          .insert(newNotifications);

        if (notifError) console.error('Failed to create notifications for daily tasks:', notifError);
      }
    }

    const expectedCheckInAssignees = activeEmployees.length;
    const assignedCheckInAssignees =
      [...existingCheckInAssignees].filter((assignedTo) => activeEmployeeIds.has(assignedTo)).length +
      createdCheckInTasks;

    return NextResponse.json({
      message:
        createdCheckInTasks + createdTemplateTasks > 0
          ? 'Successfully generated daily tasks'
          : 'All daily tasks were already generated for today',
      created: createdCheckInTasks + createdTemplateTasks,
      created_check_in_tasks: createdCheckInTasks,
      created_template_tasks: createdTemplateTasks,
      synced_check_in_tasks: syncedExistingCheckInTasks,
      check_in_assignment_status: {
        expected: expectedCheckInAssignees,
        assigned: assignedCheckInAssignees,
        complete: assignedCheckInAssignees >= expectedCheckInAssignees,
      },
      skipped_check_in_templates: skippedCheckInTemplates,
      skipped_unassigned_templates: skippedUnassignedTemplates,
      skipped_inactive_assignees: skippedInactiveAssignees,
      skipped_branch_mismatches: skippedBranchMismatch,
    });
  } catch (error) {
    console.error('Error generating daily tasks:', error);
    return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 });
  }
}
