import { NextResponse } from 'next/server';
import {
  getCommerceRequestContext,
  hasCommercePermission,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';

function canManageAccess(profile: Parameters<typeof hasCommercePermission>[0]) {
  return hasCommercePermission(profile, 'system.manage_commerce_access');
}

export async function GET(request: Request) {
  const context = await getCommerceRequestContext(request);
  if (!context || !canManageAccess(context.profile)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการสิทธิ์ Commerce' }, { status: 403 });
  }

  const admin = requireSupabaseAdmin();
  const [rolesResult, usersResult, branchesResult, assignmentsResult] = await Promise.all([
    admin.from('commerce_roles').select('id, code, name, description').order('name'),
    admin.from('users').select('id, full_name, email, role, branch_id, status').eq('status', 'active').order('full_name').limit(300),
    admin.from('branches').select('id, name').order('name'),
    admin.from('commerce_user_role_assignments').select('id, user_id, role_id, branch_id, valid_from, valid_until, created_at').order('created_at', { ascending: false }),
  ]);
  const error = [rolesResult.error, usersResult.error, branchesResult.error, assignmentsResult.error].find(Boolean);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ roles: rolesResult.data || [], users: usersResult.data || [], branches: branchesResult.data || [], assignments: assignmentsResult.data || [] });
}

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context || !canManageAccess(context.profile)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์มอบสิทธิ์ Commerce' }, { status: 403 });
    }
    const body = await request.json() as Record<string, unknown>;
    const userId = typeof body.user_id === 'string' ? body.user_id : '';
    const roleId = typeof body.role_id === 'string' ? body.role_id : '';
    const branchId = typeof body.branch_id === 'string' && body.branch_id ? body.branch_id : null;
    if (!userId || !roleId) return NextResponse.json({ error: 'ระบุผู้ใช้และ role ให้ครบถ้วน' }, { status: 400 });

    const admin = requireSupabaseAdmin();
    const [userResult, roleResult] = await Promise.all([
      admin.from('users').select('id').eq('id', userId).eq('status', 'active').maybeSingle(),
      admin.from('commerce_roles').select('id, code').eq('id', roleId).maybeSingle(),
    ]);
    if (userResult.error || !userResult.data || roleResult.error || !roleResult.data) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้หรือ role ที่เลือก' }, { status: 404 });
    }
    if (roleResult.data.code === 'commerce_owner' && branchId) {
      return NextResponse.json({ error: 'เจ้าของระบบต้องใช้ขอบเขตทุกสาขาเท่านั้น' }, { status: 400 });
    }
    if (roleResult.data.code !== 'commerce_owner' && !branchId) {
      return NextResponse.json({ error: 'role นี้ต้องระบุสาขา' }, { status: 400 });
    }
    if (branchId) {
      const { data: branch } = await admin.from('branches').select('id').eq('id', branchId).maybeSingle();
      if (!branch) return NextResponse.json({ error: 'ไม่พบสาขาที่เลือก' }, { status: 404 });
    }

    const { data, error } = await admin
      .from('commerce_user_role_assignments')
      .insert({ user_id: userId, role_id: roleId, branch_id: branchId, assigned_by_user_id: context.profile.id })
      .select('id, user_id, role_id, branch_id, valid_from, valid_until, created_at')
      .single();
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'ผู้ใช้นี้มี role นี้ในสาขาที่เลือกแล้ว' : error.message }, { status: 400 });
    return NextResponse.json({ assignment: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'มอบสิทธิ์ไม่สำเร็จ' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const context = await getCommerceRequestContext(request);
  if (!context || !canManageAccess(context.profile)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์ถอนสิทธิ์ Commerce' }, { status: 403 });
  }
  const assignmentId = new URL(request.url).searchParams.get('assignment_id');
  if (!assignmentId) return NextResponse.json({ error: 'ไม่พบรายการสิทธิ์' }, { status: 400 });
  const admin = requireSupabaseAdmin();
  const { data: assignment, error: assignmentError } = await admin
    .from('commerce_user_role_assignments')
    .select('id, role_id, branch_id')
    .eq('id', assignmentId)
    .maybeSingle();
  if (assignmentError || !assignment) return NextResponse.json({ error: 'ไม่พบรายการสิทธิ์' }, { status: 404 });
  const { data: role } = await admin.from('commerce_roles').select('code').eq('id', assignment.role_id).maybeSingle();
  if (role?.code === 'commerce_owner' && assignment.branch_id === null) {
    const { count } = await admin
      .from('commerce_user_role_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('role_id', assignment.role_id)
      .is('branch_id', null);
    if ((count || 0) <= 1) return NextResponse.json({ error: 'ต้องมีเจ้าของระบบ Commerce อย่างน้อยหนึ่งบัญชี' }, { status: 409 });
  }
  const { error } = await admin.from('commerce_user_role_assignments').delete().eq('id', assignmentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
