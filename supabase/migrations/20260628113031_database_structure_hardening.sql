-- PS Rice - database structure hardening and performance pass
-- Goals:
--   1. Replace public MVP policies with role-aware RLS.
--   2. Make Data API grants explicit and least-privilege for the current app.
--   3. Add indexes that match the app's WHERE/JOIN/ORDER BY patterns.
--   4. Add safe CHECK constraints for new writes without blocking legacy rows.
--   5. Harden storage buckets and policies.

create schema if not exists private;
revoke all on schema private from public;

alter table public.task_submissions
  add column if not exists review_rating smallint;

create or replace function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select u.role
  from public.users u
  where u.id = (select auth.uid())
    and u.status = 'active'::public.user_status
  limit 1;
$$;

create or replace function private.current_user_branch_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.branch_id
  from public.users u
  where u.id = (select auth.uid())
    and u.status = 'active'::public.user_status
  limit 1;
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.status = 'active'::public.user_status
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_user_role() = 'admin'::public.user_role, false);
$$;

create or replace function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_user_role() = 'manager'::public.user_role, false);
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_user_role() in ('admin'::public.user_role, 'manager'::public.user_role), false);
$$;

create or replace function private.can_manage_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_admin()
    or (
      private.is_manager()
      and target_branch_id is not null
      and target_branch_id = private.current_user_branch_id()
    );
$$;

create or replace function private.can_read_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_user_id = (select auth.uid())
    or private.is_admin()
    or exists (
      select 1
      from public.users target_user
      where target_user.id = target_user_id
        and private.is_manager()
        and target_user.branch_id = private.current_user_branch_id()
    )
    or exists (
      select 1
      from public.users target_user
      where target_user.id = target_user_id
        and private.is_active_user()
        and target_user.status = 'active'::public.user_status
        and target_user.role in ('admin'::public.user_role, 'manager'::public.user_role)
        and (
          target_user.role = 'admin'::public.user_role
          or target_user.branch_id = private.current_user_branch_id()
          or target_user.branch_id is null
        )
    );
$$;

create or replace function private.can_manage_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_admin()
    or exists (
      select 1
      from public.users target_user
      where target_user.id = target_user_id
        and private.is_manager()
        and target_user.role = 'employee'::public.user_role
        and target_user.branch_id = private.current_user_branch_id()
    );
$$;

create or replace function private.can_read_task(target_assigned_to uuid, target_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_assigned_to = (select auth.uid())
    or private.is_admin()
    or private.can_manage_user(target_assigned_to)
    or exists (
      select 1
      from public.task_templates template
      where template.id = target_template_id
        and private.can_manage_branch(template.branch_id)
    );
$$;

create or replace function private.can_manage_task(target_assigned_to uuid, target_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_admin()
    or private.can_manage_user(target_assigned_to)
    or exists (
      select 1
      from public.task_templates template
      where template.id = target_template_id
        and private.can_manage_branch(template.branch_id)
    );
$$;

create or replace function private.can_access_task_submission(submission_id_text text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  submission_uuid uuid;
begin
  begin
    submission_uuid := submission_id_text::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  return exists (
    select 1
    from public.task_submissions submission
    join public.tasks task on task.id = submission.task_id
    where submission.id = submission_uuid
      and (
        submission.submitted_by = (select auth.uid())
        or task.assigned_to = (select auth.uid())
        or private.can_manage_user(submission.submitted_by)
        or private.can_manage_user(task.assigned_to)
        or private.is_admin()
      )
  );
end;
$$;

create or replace function private.can_manage_user_path(target_user_id_text text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_user_uuid uuid;
begin
  begin
    target_user_uuid := target_user_id_text::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  return private.can_manage_user(target_user_uuid);
end;
$$;

revoke all on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- Trigger/helper functions should not be public RPC endpoints.
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on function public.set_updated_at_timestamp() from public, anon, authenticated;

-- New tables/functions must be granted deliberately by future migrations.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- Reset broad grants from the pulled MVP schema, then add only the grants the app needs.
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

grant select on public.branches to anon;

grant select on
  public.app_settings,
  public.attendance_records,
  public.branch_attendance_policies,
  public.branches,
  public.compensation_profiles,
  public.employee_requests,
  public.employee_shift_assignments,
  public.notifications,
  public.registration_requests,
  public.shift_sales_reports,
  public.shift_templates,
  public.submission_files,
  public.task_submissions,
  public.task_templates,
  public.tasks,
  public.users
to authenticated;

grant insert, update, delete on public.branches to authenticated;
grant insert, update, delete on public.users to authenticated;
grant insert, update on public.app_settings to authenticated;
grant insert, update on public.attendance_records to authenticated;
grant insert, update, delete on public.branch_attendance_policies to authenticated;
grant insert, update on public.compensation_profiles to authenticated;
grant insert, update on public.employee_requests to authenticated;
grant insert, update, delete on public.employee_shift_assignments to authenticated;
grant insert, update on public.notifications to authenticated;
grant insert, update on public.registration_requests to authenticated;
grant insert, update on public.shift_sales_reports to authenticated;
grant insert, update, delete on public.shift_templates to authenticated;
grant insert, update, delete on public.submission_files to authenticated;
grant insert, update on public.task_submissions to authenticated;
grant insert, update, delete on public.task_templates to authenticated;
grant insert, update, delete on public.tasks to authenticated;

grant all privileges on all tables in schema public to service_role;

-- Drop old public-open policies.
drop policy if exists "Allow public access for MVP" on public.attendance_records;
drop policy if exists "Allow public access for MVP" on public.branches;
drop policy if exists "Allow public access for MVP" on public.notifications;
drop policy if exists "Allow public access for MVP" on public.submission_files;
drop policy if exists "Allow public access for MVP" on public.task_submissions;
drop policy if exists "Allow public access for MVP" on public.task_templates;
drop policy if exists "Allow public access for MVP" on public.tasks;
drop policy if exists "Allow public access for MVP" on public.users;
drop policy if exists "Allow public access for MVP - Users" on public.users;
drop policy if exists "Allow public access for MVP - Branches" on public.branches;
drop policy if exists "Allow public access for MVP - Attendance" on public.attendance_records;
drop policy if exists "Allow public access for MVP - TaskTemplates" on public.task_templates;
drop policy if exists "Allow public access for MVP - Tasks" on public.tasks;
drop policy if exists "Allow public access for MVP - Submissions" on public.task_submissions;
drop policy if exists "Allow public access for MVP - Files" on public.submission_files;
drop policy if exists "Allow public access for MVP - Notifications" on public.notifications;
drop policy if exists "Allow public access for MVP - BranchAttendancePolicies" on public.branch_attendance_policies;
drop policy if exists "Allow public access for MVP - CompensationProfiles" on public.compensation_profiles;
drop policy if exists "Allow public access for MVP - EmployeeRequests" on public.employee_requests;
drop policy if exists "Allow public access for MVP - RegistrationRequests" on public.registration_requests;
drop policy if exists "Allow public access for MVP - ShiftAssignments" on public.employee_shift_assignments;
drop policy if exists "Allow public access for MVP - ShiftSalesReports" on public.shift_sales_reports;
drop policy if exists "Allow public access for MVP - ShiftTemplates" on public.shift_templates;
drop policy if exists "Attendance records are visible to assigned users and managers" on public.attendance_records;

alter table public.app_settings enable row level security;
alter table public.attendance_records enable row level security;
alter table public.branch_attendance_policies enable row level security;
alter table public.branches enable row level security;
alter table public.compensation_profiles enable row level security;
alter table public.employee_requests enable row level security;
alter table public.employee_shift_assignments enable row level security;
alter table public.notifications enable row level security;
alter table public.registration_requests enable row level security;
alter table public.shift_sales_reports enable row level security;
alter table public.shift_templates enable row level security;
alter table public.submission_files enable row level security;
alter table public.task_submissions enable row level security;
alter table public.task_templates enable row level security;
alter table public.tasks enable row level security;
alter table public.users enable row level security;

-- App settings
create policy "Authenticated users can read app settings"
on public.app_settings for select
to authenticated
using (private.is_active_user());

create policy "Staff can manage app settings"
on public.app_settings for all
to authenticated
using (private.is_staff())
with check (private.is_staff());

-- Branches
create policy "Public can read non-admin branches"
on public.branches for select
to anon
using (admin_only = false);

create policy "Authenticated users can read allowed branches"
on public.branches for select
to authenticated
using (admin_only = false or private.is_admin());

create policy "Staff can manage branches"
on public.branches for all
to authenticated
using (private.is_staff())
with check (private.is_staff());

-- Users
create policy "Users can read allowed profiles"
on public.users for select
to authenticated
using (private.can_read_user(id));

create policy "Staff can create allowed users"
on public.users for insert
to authenticated
with check (
  private.is_admin()
  or (
    private.is_manager()
    and role = 'employee'::public.user_role
    and branch_id = private.current_user_branch_id()
  )
);

create policy "Staff can update allowed users"
on public.users for update
to authenticated
using (private.can_manage_user(id))
with check (
  private.is_admin()
  or (
    private.is_manager()
    and role = 'employee'::public.user_role
    and branch_id = private.current_user_branch_id()
  )
);

create policy "Staff can delete allowed users"
on public.users for delete
to authenticated
using (private.can_manage_user(id));

-- Attendance
create policy "Users can read allowed attendance"
on public.attendance_records for select
to authenticated
using (user_id = (select auth.uid()) or private.can_manage_branch(branch_id));

create policy "Users can create own attendance"
on public.attendance_records for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Staff can correct attendance"
on public.attendance_records for update
to authenticated
using (private.can_manage_branch(branch_id))
with check (private.can_manage_branch(branch_id));

-- HR settings and schedules
create policy "Authenticated users can read branch attendance policies"
on public.branch_attendance_policies for select
to authenticated
using (private.is_active_user());

create policy "Staff can manage branch attendance policies"
on public.branch_attendance_policies for all
to authenticated
using (private.can_manage_branch(branch_id))
with check (private.can_manage_branch(branch_id));

create policy "Authenticated users can read shift templates"
on public.shift_templates for select
to authenticated
using (private.is_active_user());

create policy "Staff can manage shift templates"
on public.shift_templates for all
to authenticated
using (private.is_admin() or private.can_manage_branch(branch_id))
with check (private.is_admin() or private.can_manage_branch(branch_id));

create policy "Users can read allowed shift assignments"
on public.employee_shift_assignments for select
to authenticated
using (user_id = (select auth.uid()) or private.can_manage_branch(branch_id) or private.can_manage_user(user_id));

create policy "Staff can manage shift assignments"
on public.employee_shift_assignments for all
to authenticated
using (private.can_manage_branch(branch_id) or private.can_manage_user(user_id))
with check (private.can_manage_branch(branch_id) or private.can_manage_user(user_id));

create policy "Users can read allowed compensation profiles"
on public.compensation_profiles for select
to authenticated
using (user_id = (select auth.uid()) or private.can_manage_user(user_id));

create policy "Staff can manage compensation profiles"
on public.compensation_profiles for all
to authenticated
using (private.can_manage_user(user_id))
with check (private.can_manage_user(user_id));

create policy "Users can read allowed employee requests"
on public.employee_requests for select
to authenticated
using (user_id = (select auth.uid()) or private.can_manage_branch(branch_id) or private.can_manage_user(user_id));

create policy "Users can create own employee requests"
on public.employee_requests for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Staff can review employee requests"
on public.employee_requests for update
to authenticated
using (private.can_manage_branch(branch_id) or private.can_manage_user(user_id))
with check (private.can_manage_branch(branch_id) or private.can_manage_user(user_id));

create policy "Users can read own registration request status"
on public.registration_requests for select
to authenticated
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy "Staff can read registration requests"
on public.registration_requests for select
to authenticated
using (
  private.is_admin()
  or (
    private.is_manager()
    and (desired_branch_id is null or desired_branch_id = private.current_user_branch_id())
  )
);

create policy "Staff can manage registration requests"
on public.registration_requests for all
to authenticated
using (
  private.is_admin()
  or (
    private.is_manager()
    and (desired_branch_id is null or desired_branch_id = private.current_user_branch_id())
  )
)
with check (
  private.is_admin()
  or (
    private.is_manager()
    and (desired_branch_id is null or desired_branch_id = private.current_user_branch_id())
  )
);

create policy "Users can read allowed shift sales reports"
on public.shift_sales_reports for select
to authenticated
using (user_id = (select auth.uid()) or private.can_manage_branch(branch_id));

create policy "Staff can manage shift sales reports"
on public.shift_sales_reports for all
to authenticated
using (private.can_manage_branch(branch_id))
with check (private.can_manage_branch(branch_id));

-- Tasks and reviews
create policy "Users can read allowed task templates"
on public.task_templates for select
to authenticated
using (private.is_active_user());

create policy "Staff can manage task templates"
on public.task_templates for all
to authenticated
using (private.is_admin() or private.can_manage_branch(branch_id))
with check (private.is_admin() or private.can_manage_branch(branch_id));

create policy "Users can read allowed tasks"
on public.tasks for select
to authenticated
using (private.can_read_task(assigned_to, template_id));

create policy "Staff can create tasks"
on public.tasks for insert
to authenticated
with check (private.is_staff() and (assigned_to is null or private.can_manage_task(assigned_to, template_id)));

create policy "Users can update allowed tasks"
on public.tasks for update
to authenticated
using (assigned_to = (select auth.uid()) or private.can_manage_task(assigned_to, template_id))
with check (assigned_to = (select auth.uid()) or private.can_manage_task(assigned_to, template_id));

create policy "Staff can delete tasks"
on public.tasks for delete
to authenticated
using (private.can_manage_task(assigned_to, template_id));

create policy "Users can read allowed submissions"
on public.task_submissions for select
to authenticated
using (
  submitted_by = (select auth.uid())
  or private.can_manage_user(submitted_by)
  or exists (
    select 1
    from public.tasks task
    where task.id = task_id
      and (task.assigned_to = (select auth.uid()) or private.can_manage_task(task.assigned_to, task.template_id))
  )
);

create policy "Users can create own submissions"
on public.task_submissions for insert
to authenticated
with check (
  submitted_by = (select auth.uid())
  and exists (
    select 1
    from public.tasks task
    where task.id = task_id
      and task.assigned_to = (select auth.uid())
  )
);

create policy "Staff can review submissions"
on public.task_submissions for update
to authenticated
using (
  private.can_manage_user(submitted_by)
  or exists (
    select 1
    from public.tasks task
    where task.id = task_id
      and private.can_manage_task(task.assigned_to, task.template_id)
  )
)
with check (
  private.can_manage_user(submitted_by)
  or exists (
    select 1
    from public.tasks task
    where task.id = task_id
      and private.can_manage_task(task.assigned_to, task.template_id)
  )
);

create policy "Users can read allowed submission files"
on public.submission_files for select
to authenticated
using (
  exists (
    select 1
    from public.task_submissions submission
    where submission.id = submission_id
      and (
        submission.submitted_by = (select auth.uid())
        or private.can_manage_user(submission.submitted_by)
      )
  )
);

create policy "Users can create own submission files"
on public.submission_files for insert
to authenticated
with check (
  exists (
    select 1
    from public.task_submissions submission
    where submission.id = submission_id
      and submission.submitted_by = (select auth.uid())
  )
);

create policy "Users can manage allowed submission files"
on public.submission_files for update
to authenticated
using (
  exists (
    select 1
    from public.task_submissions submission
    where submission.id = submission_id
      and (
        submission.submitted_by = (select auth.uid())
        or private.can_manage_user(submission.submitted_by)
      )
  )
)
with check (
  exists (
    select 1
    from public.task_submissions submission
    where submission.id = submission_id
      and (
        submission.submitted_by = (select auth.uid())
        or private.can_manage_user(submission.submitted_by)
      )
  )
);

create policy "Users can delete allowed submission files"
on public.submission_files for delete
to authenticated
using (
  exists (
    select 1
    from public.task_submissions submission
    where submission.id = submission_id
      and (
        submission.submitted_by = (select auth.uid())
        or private.can_manage_user(submission.submitted_by)
      )
  )
);

-- Notifications
create policy "Users can read own notifications"
on public.notifications for select
to authenticated
using (user_id = (select auth.uid()) or private.is_staff());

create policy "Active users can create notifications"
on public.notifications for insert
to authenticated
with check (private.is_active_user());

create policy "Users can update allowed notifications"
on public.notifications for update
to authenticated
using (user_id = (select auth.uid()) or private.is_staff())
with check (user_id = (select auth.uid()) or private.is_staff());

-- Storage buckets and policies
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, '{"image/jpeg","image/png","image/webp","image/gif","image/avif"}'),
  ('proofs', 'proofs', true, 52428800, '{"image/jpeg","image/png","image/webp","image/gif","image/avif","video/mp4","video/webm","application/pdf"}'),
  ('employee-documents', 'employee-documents', false, 7340032, '{"image/jpeg","image/png","image/webp","application/pdf"}')
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatar images are publicly accessible" on storage.objects;
drop policy if exists "Users can upload avatars" on storage.objects;
drop policy if exists "Users can update avatars" on storage.objects;
drop policy if exists "Users can delete avatars" on storage.objects;
drop policy if exists "Proof files are publicly readable" on storage.objects;
drop policy if exists "Authenticated users can upload task and request proofs" on storage.objects;
drop policy if exists "Authenticated users can update task and request proofs" on storage.objects;
drop policy if exists "Authenticated users can delete task and request proofs" on storage.objects;
drop policy if exists "ให้ทุกคนดูรูปใน proofs ได้" on storage.objects;
drop policy if exists "ให้ทุกคนลบรูปใน proofs ได้" on storage.objects;
drop policy if exists "ให้ทุกคนอัปเดตรูปใน proof" on storage.objects;
drop policy if exists "ให้ทุกคนอัปโหลดรูปใน pr" on storage.objects;
drop policy if exists "Users can read their own employee documents" on storage.objects;
drop policy if exists "Users can upload their own employee documents" on storage.objects;
drop policy if exists "Users can update their own employee documents" on storage.objects;
drop policy if exists "Users can delete their own employee documents" on storage.objects;

create policy "Avatar images are publicly readable"
on storage.objects for select
to public
using (bucket_id = 'avatars');

create policy "Users can upload own avatars"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can update own avatars"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can delete own avatars"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Proof files are publicly readable"
on storage.objects for select
to public
using (bucket_id = 'proofs');

create policy "Authenticated users can upload scoped proofs"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'proofs'
  and (
    ((storage.foldername(name))[1] = 'requests' and (storage.foldername(name))[2] = (select auth.uid())::text)
    or ((storage.foldername(name))[1] = 'tasks' and private.can_access_task_submission((storage.foldername(name))[2]))
  )
);

create policy "Authenticated users can update scoped proofs"
on storage.objects for update
to authenticated
using (
  bucket_id = 'proofs'
  and (
    ((storage.foldername(name))[1] = 'requests' and (storage.foldername(name))[2] = (select auth.uid())::text)
    or ((storage.foldername(name))[1] = 'tasks' and private.can_access_task_submission((storage.foldername(name))[2]))
  )
)
with check (
  bucket_id = 'proofs'
  and (
    ((storage.foldername(name))[1] = 'requests' and (storage.foldername(name))[2] = (select auth.uid())::text)
    or ((storage.foldername(name))[1] = 'tasks' and private.can_access_task_submission((storage.foldername(name))[2]))
  )
);

create policy "Authenticated users can delete scoped proofs"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'proofs'
  and (
    ((storage.foldername(name))[1] = 'requests' and (storage.foldername(name))[2] = (select auth.uid())::text)
    or ((storage.foldername(name))[1] = 'tasks' and private.can_access_task_submission((storage.foldername(name))[2]))
  )
);

create policy "Users can read own employee documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'employee-documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or private.can_manage_user_path((storage.foldername(name))[1])
  )
);

create policy "Users can upload own employee documents"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can update own employee documents"
on storage.objects for update
to authenticated
using (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can delete own employee documents"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Query and foreign-key indexes.
create index if not exists users_branch_id_idx on public.users(branch_id);
create index if not exists users_role_status_branch_idx on public.users(role, status, branch_id);
create index if not exists users_email_created_at_idx on public.users(email, created_at desc);
create index if not exists users_active_email_lower_idx on public.users(lower(email)) where status = 'active'::public.user_status;

create index if not exists branches_name_idx on public.branches(name);

create index if not exists attendance_records_status_created_at_idx on public.attendance_records(status, created_at desc);
create index if not exists attendance_records_user_type_created_at_idx on public.attendance_records(user_id, type, created_at desc);

create index if not exists branch_attendance_policies_updated_at_idx on public.branch_attendance_policies(updated_at desc);

create index if not exists shift_templates_branch_active_idx on public.shift_templates(branch_id, is_active, created_at desc);
create index if not exists shift_templates_code_idx on public.shift_templates(code) where code is not null;

create index if not exists employee_shift_assignments_branch_work_date_idx on public.employee_shift_assignments(branch_id, work_date);
create index if not exists employee_shift_assignments_template_idx on public.employee_shift_assignments(shift_template_id) where shift_template_id is not null;
create index if not exists employee_shift_assignments_created_by_idx on public.employee_shift_assignments(created_by) where created_by is not null;

create index if not exists compensation_profiles_updated_at_idx on public.compensation_profiles(updated_at desc);

create index if not exists employee_requests_branch_status_created_idx on public.employee_requests(branch_id, status, created_at desc);
create index if not exists employee_requests_reviewed_by_idx on public.employee_requests(reviewed_by) where reviewed_by is not null;
create index if not exists employee_requests_created_at_idx on public.employee_requests(created_at desc);

create index if not exists registration_requests_email_created_idx on public.registration_requests(email, created_at desc);
create index if not exists registration_requests_desired_branch_idx on public.registration_requests(desired_branch_id) where desired_branch_id is not null;
create index if not exists registration_requests_reviewed_by_idx on public.registration_requests(reviewed_by) where reviewed_by is not null;

create index if not exists shift_sales_reports_user_reported_idx on public.shift_sales_reports(user_id, reported_at desc);
create index if not exists shift_sales_reports_branch_reported_idx on public.shift_sales_reports(branch_id, reported_at desc);

create index if not exists notifications_user_created_at_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, created_at desc) where is_read = false;
create index if not exists notifications_review_unread_link_idx on public.notifications(type, is_read, link) where type = 'review'::public.notification_type and is_read = false;

create index if not exists submission_files_submission_id_idx on public.submission_files(submission_id);

create index if not exists task_submissions_task_submitted_at_idx on public.task_submissions(task_id, submitted_at desc);
create index if not exists task_submissions_submitted_by_idx on public.task_submissions(submitted_by, submitted_at desc);
create index if not exists task_submissions_review_status_idx on public.task_submissions(review_status, submitted_at desc);
create index if not exists task_submissions_reviewed_by_idx on public.task_submissions(reviewed_by) where reviewed_by is not null;

create index if not exists task_templates_branch_created_at_idx on public.task_templates(branch_id, created_at desc);
create index if not exists task_templates_recurrence_branch_idx on public.task_templates(recurrence_rule, branch_id);
create index if not exists task_templates_system_branch_idx on public.task_templates(branch_id, is_system) where is_system = true;

create index if not exists tasks_assigned_to_due_date_idx on public.tasks(assigned_to, due_date);
create index if not exists tasks_template_id_idx on public.tasks(template_id) where template_id is not null;
create index if not exists tasks_due_date_idx on public.tasks(due_date);
create index if not exists tasks_status_due_assignee_idx on public.tasks(status, due_date, assigned_to);
do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('tasks_daily_template_assignee_due_unique', 'tasks_daily_template_assignee_due_idx')
  ) then
    if not exists (
      select 1
      from (
        select template_id, assigned_to, due_date
        from public.tasks
        where template_id is not null
          and assigned_to is not null
        group by template_id, assigned_to, due_date
        having count(*) > 1
        limit 1
      ) duplicates
    ) then
      create unique index tasks_daily_template_assignee_due_unique
        on public.tasks(template_id, assigned_to, due_date)
        where template_id is not null and assigned_to is not null;
    else
      create index tasks_daily_template_assignee_due_idx
        on public.tasks(template_id, assigned_to, due_date)
        where template_id is not null and assigned_to is not null;
    end if;
  end if;
end $$;

-- Safe constraints for future writes. NOT VALID avoids breaking existing legacy data.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'branches_geofence_positive_chk' and conrelid = 'public.branches'::regclass) then
    alter table public.branches
      add constraint branches_geofence_positive_chk
      check (geofence_radius_meters > 0) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'branches_coordinates_range_chk' and conrelid = 'public.branches'::regclass) then
    alter table public.branches
      add constraint branches_coordinates_range_chk
      check (latitude between -90 and 90 and longitude between -180 and 180) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_records_coordinates_range_chk' and conrelid = 'public.attendance_records'::regclass) then
    alter table public.attendance_records
      add constraint attendance_records_coordinates_range_chk
      check (
        (latitude is null or latitude between -90 and 90)
        and (longitude is null or longitude between -180 and 180)
        and (gps_accuracy is null or gps_accuracy >= 0)
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'branch_attendance_policies_time_values_chk' and conrelid = 'public.branch_attendance_policies'::regclass) then
    alter table public.branch_attendance_policies
      add constraint branch_attendance_policies_time_values_chk
      check (
        shift_start_time <> shift_end_time
        and break_minutes >= 0
        and late_grace_minutes >= 0
        and early_out_grace_minutes >= 0
        and minimum_ot_minutes >= 0
        and check_in_reward >= 0
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shift_templates_time_values_chk' and conrelid = 'public.shift_templates'::regclass) then
    alter table public.shift_templates
      add constraint shift_templates_time_values_chk
      check (
        start_time <> end_time
        and break_minutes >= 0
        and late_grace_minutes >= 0
        and early_out_grace_minutes >= 0
        and minimum_ot_minutes >= 0
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employee_shift_assignments_time_values_chk' and conrelid = 'public.employee_shift_assignments'::regclass) then
    alter table public.employee_shift_assignments
      add constraint employee_shift_assignments_time_values_chk
      check (
        start_time <> end_time
        and break_minutes >= 0
        and late_grace_minutes >= 0
        and early_out_grace_minutes >= 0
        and minimum_ot_minutes >= 0
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'compensation_profiles_nonnegative_rates_chk' and conrelid = 'public.compensation_profiles'::regclass) then
    alter table public.compensation_profiles
      add constraint compensation_profiles_nonnegative_rates_chk
      check (
        base_rate >= 0
        and ot_rate >= 0
        and late_deduction_rate >= 0
        and absence_deduction_rate >= 0
        and leave_deduction_rate >= 0
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employee_requests_amount_dates_chk' and conrelid = 'public.employee_requests'::regclass) then
    alter table public.employee_requests
      add constraint employee_requests_amount_dates_chk
      check (
        (amount is null or amount >= 0)
        and (start_date is null or end_date is null or start_date <= end_date)
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shift_sales_reports_nonnegative_sales_chk' and conrelid = 'public.shift_sales_reports'::regclass) then
    alter table public.shift_sales_reports
      add constraint shift_sales_reports_nonnegative_sales_chk
      check (
        cash_sales >= 0
        and qr_sales >= 0
        and welfare_sales >= 0
        and total_sales >= 0
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'task_templates_auto_assign_reward_chk' and conrelid = 'public.task_templates'::regclass) then
    alter table public.task_templates
      add constraint task_templates_auto_assign_reward_chk
      check (
        (auto_assign_day is null or auto_assign_day between 0 and 6)
        and (reward_amount is null or reward_amount >= 0)
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_reward_values_chk' and conrelid = 'public.tasks'::regclass) then
    alter table public.tasks
      add constraint tasks_reward_values_chk
      check (
        completion_bonus >= 0
        and (reward_amount is null or reward_amount >= 0)
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'task_submissions_review_rating_chk' and conrelid = 'public.task_submissions'::regclass) then
    alter table public.task_submissions
      add constraint task_submissions_review_rating_chk
      check (review_rating is null or review_rating between 0 and 5) not valid;
  end if;
end $$;
