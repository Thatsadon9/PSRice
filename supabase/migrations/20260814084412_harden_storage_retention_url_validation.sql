-- Only URLs owned by the active Supabase project may enqueue a Storage object
-- for deletion. This prevents a crafted external URL from resolving to an
-- arbitrary object path in the local proofs bucket.
create or replace function private.storage_public_object_path(
  p_url text,
  p_bucket text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_url is null
      or left(
        p_url,
        length('https://qppikzrhvlhcrxrkwsuk.supabase.co/storage/v1/object/public/' || p_bucket || '/')
      ) <> 'https://qppikzrhvlhcrxrkwsuk.supabase.co/storage/v1/object/public/' || p_bucket || '/'
      then null
    else split_part(
      split_part(p_url, '/storage/v1/object/public/' || p_bucket || '/', 2),
      '?',
      1
    )
  end;
$$;

revoke all on function private.storage_public_object_path(text, text)
  from public, anon, authenticated;
