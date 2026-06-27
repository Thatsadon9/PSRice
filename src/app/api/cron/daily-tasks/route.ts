import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCurrentDateStr } from '@/lib/dateUtils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const dynamic = 'force-dynamic';

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
  } catch (e) {
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
    // 0. Ensure check-in templates exist for all branches
    let branchPoliciesQuery = supabaseAdmin.from('branch_attendance_policies').select('branch_id, check_in_reward');
    if (targetBranchId) {
      branchPoliciesQuery = branchPoliciesQuery.eq('branch_id', targetBranchId);
    }
    const { data: policies, error: policiesError } = await branchPoliciesQuery;
    if (policiesError) throw policiesError;

    const policiesMap: Record<string, number> = {};
    for (const policy of policies || []) {
      policiesMap[policy.branch_id] = policy.check_in_reward ?? 50;
    }

    if (policies && policies.length > 0) {
      // Find existing system check-in templates
      const { data: existingSystemTemplates, error: sysTmplError } = await supabaseAdmin
        .from('task_templates')
        .select('id, branch_id')
        .eq('is_system', true)
        .like('title', '%เช็คอิน%');
      
      if (sysTmplError) throw sysTmplError;

      const existingSysBranches = new Set((existingSystemTemplates || []).map(t => t.branch_id));
      const newSystemTemplates = [];

      for (const policy of policies) {
        if (!existingSysBranches.has(policy.branch_id)) {
          newSystemTemplates.push({
            title: 'เช็คอินเข้างาน',
            description: 'เช็คอินเข้างานประจำวันให้สำเร็จ',
            priority: 'medium',
            proof_type_required: 'any',
            requires_approval: false,
            recurrence_rule: 'daily',
            branch_id: policy.branch_id,
            is_system: true,
            checklist_json: []
          });
        }
      }

      if (newSystemTemplates.length > 0) {
        const { error: insertSysError } = await supabaseAdmin.from('task_templates').insert(newSystemTemplates);
        if (insertSysError) console.error('Failed to insert system templates:', insertSysError);
      }
    }

    // 1. Fetch templates that are 'daily'
    let templateQuery = supabaseAdmin
      .from('task_templates')
      .select('*')
      .eq('recurrence_rule', 'daily');
    
    if (targetBranchId) {
      templateQuery = templateQuery.eq('branch_id', targetBranchId);
    }

    const { data: templates, error: templatesError } = await templateQuery;

    if (templatesError) throw templatesError;
    if (!templates || templates.length === 0) {
      return NextResponse.json({ message: 'No daily templates found', created: 0 });
    }

    // 2. Fetch all active employees
    let userQuery = supabaseAdmin
      .from('users')
      .select('id, branch_id, role, status')
      .eq('status', 'active')
      .eq('role', 'employee');
    
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

    const todayStr = getCurrentDateStr();

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

    for (const template of templates) {
      const branchId = template.branch_id;
      const targetUserIds = branchUsersMap[branchId] || [];

      for (const userId of targetUserIds) {
        const signature = `${template.id}_${userId}`;
        if (!existingSet.has(signature)) {
          // This employee doesn't have this daily task yet
          const isCheckInTask = template.is_system && template.title.includes('เช็คอิน');
          let rewardAmount = template.reward_amount;
          if (isCheckInTask && (rewardAmount === undefined || rewardAmount === null)) {
            rewardAmount = policiesMap[branchId] ?? 50;
          }

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
        created: newTasks.length 
      });
    } else {
      return NextResponse.json({ 
        message: 'All daily tasks were already generated for today', 
        created: 0 
      });
    }

  } catch (error) {
    console.error('Error generating daily tasks:', error);
    return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 });
  }
}
