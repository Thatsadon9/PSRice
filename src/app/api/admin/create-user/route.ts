import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { User, UserRole } from '@/lib/types';

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  role?: UserRole;
  branch_id?: string | null;
  team_id?: string | null;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseAdmin = supabaseUrl && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

async function createRequestClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

export async function POST(request: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client is not configured' }, { status: 500 });
    }

    const requestClient = await createRequestClient();

    if (!requestClient) {
      return NextResponse.json({ error: 'Supabase request client is not configured' }, { status: 500 });
    }

    const {
      data: { user: sessionUser },
      error: authError,
    } = await requestClient.auth.getUser();

    if (authError || !sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: requester, error: requesterError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', sessionUser.id)
      .single();

    if (requesterError || !requester) {
      return NextResponse.json({ error: 'Requester profile not found' }, { status: 403 });
    }

    const actingUser = requester as User;

    if (actingUser.status !== 'active' || (actingUser.role !== 'admin' && actingUser.role !== 'manager')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const payload = (await request.json()) as CreateUserRequest;
    const email = payload.email?.trim().toLowerCase();
    const password = payload.password?.trim();
    const fullName = payload.full_name?.trim();
    const requestedRole = payload.role || 'employee';
    const requestedBranchId = payload.branch_id?.trim() || null;
    const teamId = payload.team_id?.trim() || '';

    if (!email || !password || !fullName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 });
    }

    if (actingUser.role === 'manager' && requestedRole !== 'employee') {
      return NextResponse.json({ error: 'Managers can only create employee accounts' }, { status: 403 });
    }

    if (actingUser.role === 'manager' && !actingUser.branch_id) {
      return NextResponse.json({ error: 'Manager account is missing a branch assignment' }, { status: 400 });
    }

    if (actingUser.role === 'manager' && requestedBranchId && requestedBranchId !== actingUser.branch_id) {
      return NextResponse.json({ error: 'Managers can only create users in their own branch' }, { status: 403 });
    }

    const finalBranchId = actingUser.role === 'manager' ? actingUser.branch_id : requestedBranchId;

    if (requestedRole !== 'admin' && !finalBranchId) {
      return NextResponse.json({ error: 'Branch is required for manager and employee accounts' }, { status: 400 });
    }

    const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        team_id: teamId,
      },
    });

    if (createAuthError || !authData.user) {
      return NextResponse.json({ error: createAuthError?.message || 'Unable to create auth user' }, { status: 500 });
    }

    const { error: profileError } = await supabaseAdmin
      .from('users')
      .upsert(
        {
          id: authData.user.id,
          email,
          full_name: fullName,
          phone: '',
          role: requestedRole,
          branch_id: finalBranchId,
          team_id: teamId,
          status: 'active',
        },
        { onConflict: 'id' },
      );

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: `Account created but profile update failed: ${profileError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        user: {
          id: authData.user.id,
          email,
          role: requestedRole,
          branch_id: finalBranchId,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดภายในระบบ';
    console.error('Create user error:', err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
