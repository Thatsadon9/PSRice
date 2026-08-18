import { createClient, type Session } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL or Anon Key is missing. Check your .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

type AccessTokenCache = {
  token: string | null;
  expiresAt: number;
};

let accessTokenCache: AccessTokenCache | null = null;
let accessTokenRequest: Promise<string | null> | null = null;

function rememberSession(session: Session | null) {
  if (!session?.access_token) {
    accessTokenCache = { token: null, expiresAt: Date.now() + 2_000 };
    return;
  }

  // Refresh a little before the JWT expires so API calls never leave with a stale token.
  const expiresAt = session.expires_at
    ? session.expires_at * 1_000 - 60_000
    : Date.now() + 4 * 60_000;
  accessTokenCache = { token: session.access_token, expiresAt };
}

supabase.auth.onAuthStateChange((_event, session) => {
  rememberSession(session);
});

export async function getAccessToken() {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) {
    return accessTokenCache.token;
  }

  if (accessTokenRequest) return accessTokenRequest;

  accessTokenRequest = supabase.auth.getSession().then(({ data: { session } }) => {
    rememberSession(session);
    return session?.access_token || null;
  }).finally(() => {
    accessTokenRequest = null;
  });

  return accessTokenRequest;
}
