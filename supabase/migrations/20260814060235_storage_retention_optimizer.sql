-- Storage retention policy
--   attendance photos: 30 days after upload
--   task proofs: 5 days after the submission is reviewed
-- Permanent assets such as avatars, employee documents and request attachments
-- are intentionally excluded from this cleanup queue.

create table if not exists public.storage_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  object_path text not null,
  source_kind text not null check (source_kind in ('attendance_photo', 'task_proof')),
  source_id uuid not null,
  retention_days integer not null check (retention_days > 0),
  expires_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'deleting', 'deleted', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  last_error text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_kind, source_id)
);

comment on table public.storage_cleanup_jobs is
  'Service-role cleanup queue for temporary Supabase Storage objects.';

alter table public.storage_cleanup_jobs enable row level security;
revoke all on table public.storage_cleanup_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.storage_cleanup_jobs to service_role;

create index if not exists storage_cleanup_jobs_due_idx
  on public.storage_cleanup_jobs (expires_at, id)
  where status in ('pending', 'failed') and expires_at is not null;

create index if not exists storage_cleanup_jobs_source_idx
  on public.storage_cleanup_jobs (source_kind, source_id);

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
      or position('/storage/v1/object/public/' || p_bucket || '/' in p_url) = 0
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

create or replace function private.queue_attendance_photo_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  if tg_op = 'DELETE' then
    update public.storage_cleanup_jobs
       set status = 'cancelled',
           updated_at = now()
     where source_kind = 'attendance_photo'
       and source_id = old.id
       and status not in ('deleted', 'cancelled');
    return old;
  end if;

  v_path := private.storage_public_object_path(new.photo_url, 'proofs');

  if v_path is null then
    update public.storage_cleanup_jobs
       set status = 'cancelled',
           updated_at = now()
     where source_kind = 'attendance_photo'
       and source_id = new.id
       and status not in ('deleted', 'cancelled');
    return new;
  end if;

  insert into public.storage_cleanup_jobs (
    bucket_id,
    object_path,
    source_kind,
    source_id,
    retention_days,
    expires_at,
    status
  ) values (
    'proofs',
    v_path,
    'attendance_photo',
    new.id,
    30,
    new.created_at + interval '30 days',
    'pending'
  )
  on conflict (source_kind, source_id) do update
     set bucket_id = excluded.bucket_id,
         object_path = excluded.object_path,
         retention_days = excluded.retention_days,
         expires_at = excluded.expires_at,
         status = 'pending',
         attempts = 0,
         last_attempt_at = null,
         last_error = null,
         deleted_at = null,
         updated_at = now();

  return new;
end;
$$;

revoke all on function private.queue_attendance_photo_cleanup()
  from public, anon, authenticated;

drop trigger if exists queue_attendance_photo_cleanup on public.attendance_records;
create trigger queue_attendance_photo_cleanup
after insert or update of photo_url or delete on public.attendance_records
for each row execute function private.queue_attendance_photo_cleanup();

create or replace function private.queue_task_proof_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_review_status text;
  v_reviewed_at timestamptz;
  v_submitted_at timestamptz;
begin
  if tg_op = 'DELETE' then
    update public.storage_cleanup_jobs
       set status = 'cancelled',
           updated_at = now()
     where source_kind = 'task_proof'
       and source_id = old.id
       and status not in ('deleted', 'cancelled');
    return old;
  end if;

  v_path := private.storage_public_object_path(new.file_url, 'proofs');

  if v_path is null then
    update public.storage_cleanup_jobs
       set status = 'cancelled',
           updated_at = now()
     where source_kind = 'task_proof'
       and source_id = new.id
       and status not in ('deleted', 'cancelled');
    return new;
  end if;

  select submission.review_status::text,
         submission.reviewed_at,
         submission.submitted_at
    into v_review_status, v_reviewed_at, v_submitted_at
    from public.task_submissions as submission
   where submission.id = new.submission_id;

  insert into public.storage_cleanup_jobs (
    bucket_id,
    object_path,
    source_kind,
    source_id,
    retention_days,
    expires_at,
    status
  ) values (
    'proofs',
    v_path,
    'task_proof',
    new.id,
    5,
    case
      when v_review_status in ('approved', 'rejected')
        then coalesce(v_reviewed_at, v_submitted_at, new.created_at) + interval '5 days'
      else null
    end,
    'pending'
  )
  on conflict (source_kind, source_id) do update
     set bucket_id = excluded.bucket_id,
         object_path = excluded.object_path,
         retention_days = excluded.retention_days,
         expires_at = excluded.expires_at,
         status = 'pending',
         attempts = 0,
         last_attempt_at = null,
         last_error = null,
         deleted_at = null,
         updated_at = now();

  return new;
end;
$$;

revoke all on function private.queue_task_proof_cleanup()
  from public, anon, authenticated;

drop trigger if exists queue_task_proof_cleanup on public.submission_files;
create trigger queue_task_proof_cleanup
after insert or update of file_url, submission_id or delete on public.submission_files
for each row execute function private.queue_task_proof_cleanup();

create or replace function private.refresh_task_proof_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.storage_cleanup_jobs as job
     set expires_at = case
           when new.review_status::text in ('approved', 'rejected')
             then coalesce(new.reviewed_at, new.submitted_at) + interval '5 days'
           else null
         end,
         status = case
           when job.status in ('deleted', 'cancelled') then job.status
           else 'pending'
         end,
         attempts = case
           when job.status in ('deleted', 'cancelled') then job.attempts
           else 0
         end,
         last_attempt_at = case
           when job.status in ('deleted', 'cancelled') then job.last_attempt_at
           else null
         end,
         last_error = case
           when job.status in ('deleted', 'cancelled') then job.last_error
           else null
         end,
         updated_at = now()
    from public.submission_files as file
   where file.submission_id = new.id
     and job.source_kind = 'task_proof'
     and job.source_id = file.id;

  return new;
end;
$$;

revoke all on function private.refresh_task_proof_expiry()
  from public, anon, authenticated;

drop trigger if exists refresh_task_proof_expiry on public.task_submissions;
create trigger refresh_task_proof_expiry
after update of review_status, reviewed_at on public.task_submissions
for each row execute function private.refresh_task_proof_expiry();

create or replace function public.claim_storage_cleanup_jobs(p_limit integer default 500)
returns table (
  id uuid,
  bucket_id text,
  object_path text,
  source_kind text,
  source_id uuid,
  attempts integer
)
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select job.id
      from public.storage_cleanup_jobs as job
     where job.expires_at <= now()
       and job.attempts < 5
       and (
         job.status in ('pending', 'failed')
         or (
           job.status = 'deleting'
           and job.last_attempt_at < now() - interval '15 minutes'
         )
       )
     order by job.expires_at, job.id
     for update skip locked
     limit greatest(1, least(coalesce(p_limit, 500), 1000))
  ), claimed as (
    update public.storage_cleanup_jobs as job
       set status = 'deleting',
           attempts = job.attempts + 1,
           last_attempt_at = now(),
           last_error = null,
           updated_at = now()
      from candidates
     where job.id = candidates.id
    returning job.id,
              job.bucket_id,
              job.object_path,
              job.source_kind,
              job.source_id,
              job.attempts
  )
  select * from claimed;
$$;

revoke all on function public.claim_storage_cleanup_jobs(integer)
  from public, anon, authenticated;
grant execute on function public.claim_storage_cleanup_jobs(integer)
  to service_role;

-- Existing target-project objects are enrolled without touching legacy URLs that
-- still point at the previous Supabase project.
insert into public.storage_cleanup_jobs (
  bucket_id,
  object_path,
  source_kind,
  source_id,
  retention_days,
  expires_at,
  status
)
select 'proofs',
       private.storage_public_object_path(record.photo_url, 'proofs'),
       'attendance_photo',
       record.id,
       30,
       record.created_at + interval '30 days',
       'pending'
  from public.attendance_records as record
 where record.photo_url like '%qppikzrhvlhcrxrkwsuk.supabase.co/storage/v1/object/public/proofs/%'
on conflict (source_kind, source_id) do nothing;

insert into public.storage_cleanup_jobs (
  bucket_id,
  object_path,
  source_kind,
  source_id,
  retention_days,
  expires_at,
  status
)
select 'proofs',
       private.storage_public_object_path(file.file_url, 'proofs'),
       'task_proof',
       file.id,
       5,
       case
         when submission.review_status::text in ('approved', 'rejected')
           then coalesce(submission.reviewed_at, submission.submitted_at) + interval '5 days'
         else null
       end,
       'pending'
  from public.submission_files as file
  join public.task_submissions as submission on submission.id = file.submission_id
 where file.file_url like '%qppikzrhvlhcrxrkwsuk.supabase.co/storage/v1/object/public/proofs/%'
on conflict (source_kind, source_id) do nothing;

-- Foreign-key indexes reported by the Supabase database advisor. PostgreSQL does
-- not create indexes for referencing columns automatically.
create index if not exists commerce_role_permissions_permission_code_idx on public.commerce_role_permissions (permission_code);
create index if not exists commerce_user_role_assignments_assigned_by_user_id_idx on public.commerce_user_role_assignments (assigned_by_user_id);
create index if not exists commerce_user_role_assignments_role_id_idx on public.commerce_user_role_assignments (role_id);
create index if not exists expenses_approved_by_user_id_idx on public.expenses (approved_by_user_id);
create index if not exists expenses_recorded_by_user_id_idx on public.expenses (recorded_by_user_id);
create index if not exists goods_receipt_items_product_unit_id_idx on public.goods_receipt_items (product_unit_id);
create index if not exists goods_receipt_items_purchase_order_item_id_idx on public.goods_receipt_items (purchase_order_item_id);
create index if not exists goods_receipts_received_by_user_id_idx on public.goods_receipts (received_by_user_id);
create index if not exists goods_receipts_supplier_id_idx on public.goods_receipts (supplier_id);
create index if not exists incomes_recorded_by_user_id_idx on public.incomes (recorded_by_user_id);
create index if not exists notifications_actor_user_id_idx on public.notifications (actor_user_id);
create index if not exists notifications_branch_id_idx on public.notifications (branch_id);
create index if not exists online_order_items_product_unit_id_idx on public.online_order_items (product_unit_id);
create index if not exists online_orders_customer_id_idx on public.online_orders (customer_id);
create index if not exists purchase_order_items_product_unit_id_idx on public.purchase_order_items (product_unit_id);
create index if not exists purchase_orders_approved_by_user_id_idx on public.purchase_orders (approved_by_user_id);
create index if not exists purchase_orders_created_by_user_id_idx on public.purchase_orders (created_by_user_id);
create index if not exists stock_adjustments_performed_by_user_id_idx on public.stock_adjustments (performed_by_user_id);
create index if not exists stock_adjustments_product_id_idx on public.stock_adjustments (product_id);
create index if not exists stock_balances_product_id_idx on public.stock_balances (product_id);
create index if not exists stock_transfer_items_product_unit_id_idx on public.stock_transfer_items (product_unit_id);
create index if not exists stock_transfers_approved_by_user_id_idx on public.stock_transfers (approved_by_user_id);
create index if not exists stock_transfers_received_by_user_id_idx on public.stock_transfers (received_by_user_id);
create index if not exists stock_transfers_requested_by_user_id_idx on public.stock_transfers (requested_by_user_id);
create index if not exists stock_transfers_shipped_by_user_id_idx on public.stock_transfers (shipped_by_user_id);
