-- ==========================================
-- WorkFlow Pro - Create Employee Documents Bucket
-- Private storage for ID cards and bank book files.
-- Run this in the Supabase SQL Editor.
-- ==========================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-documents',
  'employee-documents',
  false,
  7340032,
  '{"image/jpeg","image/png","image/webp","application/pdf"}'
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their own employee documents" on storage.objects;
create policy "Users can read their own employee documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can upload their own employee documents" on storage.objects;
create policy "Users can upload their own employee documents"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update their own employee documents" on storage.objects;
create policy "Users can update their own employee documents"
on storage.objects for update
to authenticated
using (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own employee documents" on storage.objects;
create policy "Users can delete their own employee documents"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
