-- ==========================================
-- PS Rice Wholesale — Create Avatars Storage Bucket
-- Run this in the Supabase SQL Editor
-- ==========================================

-- 1. Create the bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB limit
  '{"image/jpeg","image/png","image/webp","image/gif","image/avif"}'
) on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. Allow public access to read all avatars
create policy "Avatar images are publicly accessible"
on storage.objects for select
to public
using (bucket_id = 'avatars');

-- 3. Allow authenticated users to upload their own avatars
create policy "Users can upload avatars"
on storage.objects for insert
to authenticated
with check (bucket_id = 'avatars');

-- 4. Allow authenticated users to update their avatars
create policy "Users can update avatars"
on storage.objects for update
to authenticated
using (bucket_id = 'avatars');

-- 5. Allow users to delete their avatars
create policy "Users can delete avatars"
on storage.objects for delete
to authenticated
using (bucket_id = 'avatars');
