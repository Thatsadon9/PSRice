import { NextResponse } from 'next/server';
import type { User } from '@/lib/types';
import { getAuthenticatedRequestContext, supabaseAdmin } from '@/lib/serverAuth';

export async function DELETE(request: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client is not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const userIdToDelete = searchParams.get('id');

    if (!userIdToDelete) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
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

    // Fetch the target user to delete to check branch alignment if manager
    const { data: targetUser, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userIdToDelete)
      .single();

    if (fetchError || !targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    const targetUserTyped = targetUser as User;

    // Protection: Cannot delete yourself via this admin API
    if (actingUser.id === userIdToDelete) {
      return NextResponse.json({ error: 'Cannot delete your own account via Admin API' }, { status: 400 });
    }

    // Protection: Managers can only delete employees in their own branch
    if (actingUser.role === 'manager') {
      if (targetUserTyped.role !== 'employee') {
        return NextResponse.json({ error: 'Managers can only delete employee accounts' }, { status: 403 });
      }
      if (targetUserTyped.branch_id !== actingUser.branch_id) {
        return NextResponse.json({ error: 'Managers can only delete users in their own branch' }, { status: 403 });
      }
    }

    // Protection: Admins can't delete other Admins unless they are the "super admin" (optional, but good for safety)
    // For now, let's just let admins delete anyone except themselves to keep it simple as requested.

    // 1. Delete from public.users (will trigger ON DELETE CASCADE for related tables)
    const { error: publicDeleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userIdToDelete);

    if (publicDeleteError) {
      return NextResponse.json({ error: `Failed to delete profile: ${publicDeleteError.message}` }, { status: 500 });
    }

    // 2. Delete from auth.users (Supabase Identity)
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userIdToDelete);

    if (authDeleteError) {
      // Note: If this fails, the public record is already gone. 
      // This is slightly inconsistent but usually auth deletion failure is rare if public succeeded.
      return NextResponse.json({ 
        error: `Profile deleted, but identity deletion failed: ${authDeleteError.message}. Please contact support.` 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดภายในระบบ';
    console.error('Delete user error:', err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
