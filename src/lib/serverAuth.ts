import { createServerClient } from '@supabase/ssr';
import { createClient, type User as SupabaseAuthUser } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { User } from '@/lib/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

function createStatelessClient(apiKey: string) {
  return createClient(supabaseUrl!, apiKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function getBearerToken(request: Request) {
  const header = request.headers.get('authorization');

  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

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

export async function getAuthenticatedAuthUser(request: Request): Promise<SupabaseAuthUser | null> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const accessToken = getBearerToken(request);

  if (accessToken) {
    const authClient = createStatelessClient(supabaseAnonKey);
    const {
      data: { user },
      error,
    } = await authClient.auth.getUser(accessToken);

    if (!error && user) {
      return user;
    }
  }

  const requestClient = await createRequestClient();

  if (!requestClient) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await requestClient.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function getAuthenticatedRequestContext(
  request: Request,
): Promise<{ authUser: SupabaseAuthUser; profile: User } | null> {
  if (!supabaseAdmin) {
    return null;
  }

  const authUser = await getAuthenticatedAuthUser(request);

  if (!authUser) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    authUser,
    profile: data as User,
  };
}

export async function verifyUserPassword(email: string, password: string) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return false;
  }

  const authClient = createStatelessClient(supabaseAnonKey);
  const { error } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  if (!error) {
    await authClient.auth.signOut();
  }

  return !error;
}
