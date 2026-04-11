import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Initialize a Supabase client with the Service Role Key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { email, password, full_name, role, branch_id, team_id } = await request.json();

    if (!email || !password || !full_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Automatically confirm the email
      user_metadata: { full_name }
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    // 2. The Trigger `on_auth_user_created` will automatically create the record in `public.users`.
    // However, because we might want to set the branch_id and team_id immediately, 
    // we should update that record now.
    
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        role: role || 'employee',
        branch_id: branch_id || null,
        team_id: team_id || '',
        full_name: full_name // Ensure fullname is set correctly in case of meta data delays
      })
      .eq('id', authData.user.id);

    if (updateError) {
      return NextResponse.json({ 
        error: `Account created but profile update failed: ${updateError.message}` 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      user: authData.user 
    }, { status: 200 });

  } catch (err: any) {
    console.error('API Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
