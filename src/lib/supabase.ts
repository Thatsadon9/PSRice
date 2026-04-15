import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL or Anon Key is missing. Check your .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || null;
}
