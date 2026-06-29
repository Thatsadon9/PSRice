import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCurrentDateStr } from '@/lib/dateUtils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const dynamic = 'force-dynamic';

const DEFAULT_CHECK_IN_REWARD = 50;
const CHECK_IN_TITLE_KEYWORD = '\u0e40\u0e0a\u0e47\u0e04\u0e2d\u0e34\u0e19';

function normalizeRewardAmount(value: unknown, fallback = DEFAULT_CHECK_IN_REWARD) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get('branch_id');
  return handleDailyTasks(branchId);
}

export async function POST(request: Request) {
  let branchId = null;
  try {
    const body = await request.json();
    branchId = body.branch_id;
  } catch {
    // If no body or not JSON, check query params as fallback
    const { searchParams } = new URL(request.url);
    branchId = searchParams.get('branch_id');
  }
  return handleDailyTasks(branchId);
}

async function handleDailyTasks(targetBranchId: string | null = null) {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase service role credentials');
    return NextResponse.json({ error: 'Missing Supabase service role credentials' }, { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    const { data: defaultRewardSetting, error: defaultRewardError } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'default_check_in_reward')
      .maybeSingle();
    if (defaultRewardError) throw defaultRewardError;

    const defaultCheckInReward = normalizeRewardAmount(defaultRewardSetting?.value);

    // 0. Ensure one global check-in template exists for all branches
    let branchPoliciesQuery = supabaseAdmin
      .from('branch_attendance_policies')
      .select('branch_id, check_in_reward, use_default_check_in_reward');
    if (targetBranchId) {
      branchPoliciesQuery = branchPoliciesQuery.eq('branch_id', targetBranchId);
    }
    const { data: policies, error: policiesError } = await branchPoliciesQuery;
    if (policiesError) throw policiesError;

    const policiesMap: Record<string, number | null> = {};
    for (const policy of policies || []) {
      const usesDefaultReward = policy.use_default_check_in_reward !== false;
      policiesMap[policy.branch_id] = usesDefaultReward
        ? null
        : normalizeRewardAmount(policy.check_in_reward, defaultCheckInReward);
    }

    const { data: globalCheckInTemplates, error: sysTmplError } = await supabaseAdmin
      .from('task_templates')
      .select('id')
      .eq('is_system', true)
      .is('branch_id', null)
      .like('title', `%${CHECK_IN_TITLE_KEYWORD}%`)
      .limit(1);

    if (sysTmplError) throw sysTmplError;

    if (!globalCheckInTemplates || globalCheckInTemplates.length === 0) {
      const { error: insertSysError } = await supabaseAdmin.from('task_templates').insert({
        title: 'เช็คอินเข้างาน',
        description: 'เช็คอินเข้างานประจำวันให้สำเร็จ',
        priority: 'medium',
        proof_type_required: 'any',
        requires_approval: false,
        recurrence_rule: 'daily',
        branch_id: null,
        assigned_to: null,
        is_system: true,
        reward_amount: defaultCheckInReward,
        checklist_json: []
      });

      if (insertSysError) console.error('Failed to insert global system template:', insertSysError);
    }

    // 1. Fetch templates that are 'daily'
    let templateQuery = supabaseAdmin
      .from('task_templates')
      .select('*')
      .eq('recurrence_rule', 'daily');
    
    if (targetBranchId) {
      templateQuery = templateQuery.or(`branch_id.eq.${targetBranchId},branch_id.is.null`);
    }

    const { data: templates, error: templatesError } = await templateQuery;

    if (templatesError) throw templatesError;
    if (!templates || templates.length === 0) {
      return NextResponse.json({ message: 'No daily templates found', created: 0 });
    }
    const dailyTemplates = templates.filter((template) => {
      const isLegacyBranchCheckInTemplate =
        template.is_system &&
        template.branch_id !== null &&
        template.title.includes(CHECK_IN_TITLE_KEYWORD);

      return !isLegacyBranchCheckInTemplate;
    });
    const skippedLegacyCheckInTemplates = templates.length - dailyTemplates.length;

    if (dailyTemplates.length === 0) {
      return NextResponse.json({
        message: 'No daily templates found after skipping legacy branch check-in templates',
        created: 0,
        skipped_legacy_check_in_templates: skippedLegacyCheckInTemplates,
      });
    }

    // 2. Fetch active users for assigned templates and system check-in tasks
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
      return NextResponse.json({ message: 'No active employees found', created: 0 });
    }

    // Group active employees by branch
    const branchUsersMap: Record<string, string[]> = {};
    for (const user of users) {
      if (!branchUsersMap[user.branch_id]) {
        branchUsersMap[user.branch_id] = [];
      }
      branchUsersMap[user.branch_id].push(user.id);
    }
    const usersById = new Map(users.map((user) => [user.id, user]));

    const todayStr = getCurrentDateStr();

    let syncedExistingCheckInTasks = 0;
    for (const [branchId, userIds] of Object.entries(branchUsersMap)) {
      if (userIds.length === 0) {
        continue;
      }

      const { count, error: syncCheckInError } = await supabaseAdmin
        .from('tasks')
        .update(
          { reward_amount: policiesMap[branchId] ?? defaultCheckInReward },
          { count: 'exact' },
        )
        .like('title', `%${CHECK_IN_TITLE_KEYWORD}%`)
        .eq('status', 'pending')
        .eq('due_date', todayStr)
        .in('assigned_to', userIds);

      if (syncCheckInError) throw syncCheckInError;
      syncedExistingCheckInTasks += count ?? 0;
    }

    // 3. Find if we already generated tasks for today
    // We fetch current tasks matching today's due date
    const { data: existingTasks, error: existingTasksError } = await supabaseAdmin
      .from('tasks')
      .select('template_id, assigned_to')
      .eq('due_date', todayStr);

    if (existingTasksError) throw existingTasksError;

    const existingSet = new Set(
      (existingTasks || []).map(t => `${t.template_id}_${t.assigned_to}`)
    );

    // 4. Prepare new tasks and notifications
    const newTasks = [];
    const newNotifications = [];
    let skippedUnassignedTemplates = 0;
    let skippedInactiveAssignees = 0;
    let skippedBranchMismatch = 0;

    for (const template of dailyTemplates) {
      const branchId = typeof template.branch_id === 'string' ? template.branch_id : null;
      const isCheckInTask = template.is_system && template.title.includes(CHECK_IN_TITLE_KEYWORD);
      const assignedUserId = typeof template.assigned_to === 'string' ? template.assigned_to : '';
      const targetUserIds = assignedUserId
        ? [assignedUserId]
        : isCheckInTask
          ? branchId
            ? branchUsersMap[branchId] || []
            : users.map((user) => user.id)
          : [];

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
        if (!existingSet.has(signature)) {
          // This employee doesn't have this daily task yet
          const rewardAmount = isCheckInTask
            ? (policiesMap[assignedUser.branch_id] ?? template.reward_amount ?? defaultCheckInReward)
            : template.reward_amount;

          newTasks.push({
            template_id: template.id,
            assigned_to: userId,
            title: template.title,
            description: template.description,
            priority: template.priority,
            proof_type_required: template.proof_type_required,
            checklist_state: template.checklist_json || [],
            due_date: todayStr,
            status: 'pending',
            reward_amount: rewardAmount
          });

          if (!isCheckInTask) {
            newNotifications.push({
              user_id: userId,
              title: 'งานใหม่รายวัน',
              message: `ระบบได้มอบหมายงานรายวัน "${template.title}" ให้คุณ (กำหนดส่ง: วันนี้)`,
              type: 'task',
              link: '/employee/tasks'
            });
          }
        }
      }
    }

    // 5. Insert new tasks
    if (newTasks.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('tasks')
        .insert(newTasks);
      
      if (insertError) throw insertError;

      // 6. Insert notifications
      if (newNotifications.length > 0) {
        const { error: notifError } = await supabaseAdmin
          .from('notifications')
          .insert(newNotifications);
        
        if (notifError) console.error('Failed to create notifications for daily tasks:', notifError);
      }

      return NextResponse.json({ 
        message: 'Successfully generated daily tasks', 
        created: newTasks.length,
        synced: syncedExistingCheckInTasks,
        skipped_unassigned_templates: skippedUnassignedTemplates,
        skipped_inactive_assignees: skippedInactiveAssignees,
        skipped_branch_mismatches: skippedBranchMismatch,
        skipped_legacy_check_in_templates: skippedLegacyCheckInTemplates,
      });
    } else {
      return NextResponse.json({ 
        message: 'All daily tasks were already generated for today', 
        created: 0,
        synced: syncedExistingCheckInTasks,
        skipped_unassigned_templates: skippedUnassignedTemplates,
        skipped_inactive_assignees: skippedInactiveAssignees,
        skipped_branch_mismatches: skippedBranchMismatch,
        skipped_legacy_check_in_templates: skippedLegacyCheckInTemplates,
      });
    }

  } catch (error) {
    console.error('Error generating daily tasks:', error);
    return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 });
  }
}
