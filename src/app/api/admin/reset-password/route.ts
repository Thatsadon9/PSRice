import { NextResponse } from 'next/server';
import type { User } from '@/lib/types';
import { getAuthenticatedRequestContext, supabaseAdmin } from '@/lib/serverAuth';

interface ResetPasswordRequest {
  userId: string;
  password?: string;
}

export async function POST(request: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client is not configured' }, { status: 500 });
    }

    const requestContext = await getAuthenticatedRequestContext(request);

    if (!requestContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const actingUser = requestContext.profile as User;

    // Check if acting user is active and has enough permissions (Admin or Manager)
    if (actingUser.status !== 'active' || (actingUser.role !== 'admin' && actingUser.role !== 'manager')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const payload = (await request.json()) as ResetPasswordRequest;
    const userIdToReset = payload.userId?.trim();
    const newPassword = payload.password?.trim();

    if (!userIdToReset || !newPassword) {
      return NextResponse.json({ error: 'User ID and Password are required' }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 });
    }

    // Fetch the target user to check branch alignment if manager
    const { data: targetUser, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userIdToReset)
      .single();

    if (fetchError || !targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    const targetUserTyped = targetUser as User;

    // Protection: Managers can only reset passwords for employees in their own branch
    if (actingUser.role === 'manager') {
      if (targetUserTyped.role !== 'employee') {
        return NextResponse.json({ error: 'Managers can only reset employee passwords' }, { status: 403 });
      }
      if (targetUserTyped.branch_id !== actingUser.branch_id) {
        return NextResponse.json({ error: 'Managers can only reset passwords for users in their own branch' }, { status: 403 });
      }
    }

    // Update the password in auth.users (Supabase Identity)
    const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(userIdToReset, {
      password: newPassword,
    });

    if (resetError) {
      return NextResponse.json({ error: `Failed to reset password: ${resetError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดภายในระบบ';
    console.error('Reset password error:', err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
