import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildRegistrationCreatedNotifications } from '@/lib/requestHelpers';
import type { RegistrationRequest, User } from '@/lib/types';

interface RegisterRequestBody {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  desired_branch_id?: string | null;
  team_id?: string | null;
  note?: string | null;
}

const supabaseAdmin = (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

async function cleanupCreatedUser(userId?: string) {
  if (!supabaseAdmin || !userId) {
    return;
  }

  try {
    await supabaseAdmin.auth.admin.deleteUser(userId);
  } catch (error) {
    console.error('Failed to cleanup created auth user', error);
  }
}

export async function POST(request: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'ระบบสมัครสมาชิกยังไม่ถูกตั้งค่า service role' }, { status: 500 });
    }

    const body = await request.json() as RegisterRequestBody;
    const fullName = body.full_name?.trim();
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim();
    const password = body.password?.trim();
    const desiredBranchId = body.desired_branch_id || null;
    const teamId = body.team_id?.trim() || '';
    const note = body.note?.trim() || null;

    if (!fullName || !email || !phone || !password) {
      return NextResponse.json({ error: 'กรอกข้อมูลสำคัญไม่ครบ' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }, { status: 400 });
    }

    const { data: latestRequest } = await supabaseAdmin
      .from('registration_requests')
      .select('status')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRequest?.status === 'pending') {
      return NextResponse.json({ error: 'อีเมลนี้มีคำขอสมัครที่รออนุมัติอยู่แล้ว' }, { status: 409 });
    }

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, status')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let userId = existingUser?.id as string | undefined;
    let createdNewUser = false;

    if (existingUser?.status === 'active') {
      return NextResponse.json({ error: 'อีเมลนี้มีบัญชีที่เปิดใช้งานอยู่แล้ว' }, { status: 409 });
    }

    if (userId) {
      const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        user_metadata: {
          full_name: fullName,
          phone,
          team_id: teamId,
        },
      });

      if (updateAuthError) {
        return NextResponse.json({ error: updateAuthError.message || 'ไม่สามารถอัปเดตบัญชีเดิมได้' }, { status: 500 });
      }
    } else {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone,
          team_id: teamId,
        },
      });

      if (authError || !authData.user) {
        return NextResponse.json({ error: authError?.message || 'ไม่สามารถสร้างบัญชีได้' }, { status: 500 });
      }

      userId = authData.user.id;
      createdNewUser = true;
    }

    const { error: profileError } = await supabaseAdmin
      .from('users')
      .update({
        full_name: fullName,
        email,
        phone,
        role: 'employee',
        branch_id: desiredBranchId,
        team_id: teamId,
        status: 'inactive',
      })
      .eq('id', userId);

    if (profileError) {
      await cleanupCreatedUser(createdNewUser ? userId : undefined);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const { error: requestError } = await supabaseAdmin
      .from('registration_requests')
      .insert({
        full_name: fullName,
        email,
        phone,
        desired_branch_id: desiredBranchId,
        team_id: teamId,
        note,
        status: 'pending',
      });

    if (requestError) {
      await cleanupCreatedUser(createdNewUser ? userId : undefined);
      return NextResponse.json({ error: requestError.message }, { status: 500 });
    }

    const { data: approverRows } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('status', 'active');

    const recipients = ((approverRows || []) as User[]).filter((user) => {
      if (user.role === 'admin') {
        return true;
      }

      return user.role === 'manager' && (!!desiredBranchId ? user.branch_id === desiredBranchId : true);
    });

    if (recipients.length > 0) {
      const registrationPreview: RegistrationRequest = {
        id: 'preview',
        full_name: fullName,
        email,
        phone,
        desired_branch_id: desiredBranchId,
        team_id: teamId || null,
        note,
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        review_note: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await supabaseAdmin
        .from('notifications')
        .insert(buildRegistrationCreatedNotifications(registrationPreview, recipients));
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected register error';
    console.error('Register error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
