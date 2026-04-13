-- ==========================================
-- WorkFlow Pro - HR Core Phase 1
-- Shift scheduling, attendance rules, payroll setup,
-- employee requests, and registration requests.
-- Run this in the Supabase SQL Editor.
-- ==========================================

create extension if not exists pgcrypto;

do $$
begin
  create type shift_assignment_status as enum ('scheduled', 'day_off', 'leave', 'holiday');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type compensation_type as enum ('daily', 'hourly', 'monthly');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type employee_request_type as enum ('leave', 'advance', 'expense');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type approval_status as enum ('pending', 'approved', 'rejected', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.branch_attendance_policies (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  shift_start_time time not null default '08:30',
  shift_end_time time not null default '17:30',
  break_minutes integer not null default 60,
  late_grace_minutes integer not null default 15,
  early_out_grace_minutes integer not null default 0,
  minimum_ot_minutes integer not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_attendance_policies_branch_id_key unique (branch_id)
);

create table if not exists public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  name text not null,
  code text,
  color text not null default '#0f766e',
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 60,
  late_grace_minutes integer not null default 15,
  early_out_grace_minutes integer not null default 0,
  minimum_ot_minutes integer not null default 30,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_shift_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  shift_template_id uuid references public.shift_templates(id) on delete set null,
  work_date date not null,
  shift_name text not null,
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 60,
  late_grace_minutes integer not null default 15,
  early_out_grace_minutes integer not null default 0,
  minimum_ot_minutes integer not null default 30,
  status shift_assignment_status not null default 'scheduled',
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_shift_assignments_user_work_date_key unique (user_id, work_date)
);

create table if not exists public.compensation_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  pay_type compensation_type not null default 'daily',
  base_rate numeric(12,2) not null default 0,
  ot_rate numeric(12,2) not null default 0,
  late_deduction_rate numeric(12,2) not null default 0,
  absence_deduction_rate numeric(12,2) not null default 0,
  leave_deduction_rate numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compensation_profiles_user_id_key unique (user_id)
);

create table if not exists public.employee_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  request_type employee_request_type not null,
  status approval_status not null default 'pending',
  title text not null,
  description text,
  amount numeric(12,2),
  start_date date,
  end_date date,
  attachment_urls jsonb not null default '[]'::jsonb,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.registration_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null default '',
  desired_branch_id uuid references public.branches(id) on delete set null,
  team_id text,
  note text,
  status approval_status not null default 'pending',
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_shift_assignments_work_date_idx
  on public.employee_shift_assignments(work_date);

create index if not exists employee_shift_assignments_user_work_date_idx
  on public.employee_shift_assignments(user_id, work_date);

create index if not exists employee_requests_user_idx
  on public.employee_requests(user_id, status);

create index if not exists registration_requests_status_idx
  on public.registration_requests(status, created_at desc);

drop trigger if exists set_branch_attendance_policies_updated_at on public.branch_attendance_policies;
create trigger set_branch_attendance_policies_updated_at
before update on public.branch_attendance_policies
for each row execute procedure public.set_updated_at_timestamp();

drop trigger if exists set_shift_templates_updated_at on public.shift_templates;
create trigger set_shift_templates_updated_at
before update on public.shift_templates
for each row execute procedure public.set_updated_at_timestamp();

drop trigger if exists set_employee_shift_assignments_updated_at on public.employee_shift_assignments;
create trigger set_employee_shift_assignments_updated_at
before update on public.employee_shift_assignments
for each row execute procedure public.set_updated_at_timestamp();

drop trigger if exists set_compensation_profiles_updated_at on public.compensation_profiles;
create trigger set_compensation_profiles_updated_at
before update on public.compensation_profiles
for each row execute procedure public.set_updated_at_timestamp();

drop trigger if exists set_employee_requests_updated_at on public.employee_requests;
create trigger set_employee_requests_updated_at
before update on public.employee_requests
for each row execute procedure public.set_updated_at_timestamp();

drop trigger if exists set_registration_requests_updated_at on public.registration_requests;
create trigger set_registration_requests_updated_at
before update on public.registration_requests
for each row execute procedure public.set_updated_at_timestamp();

alter table public.branch_attendance_policies enable row level security;
alter table public.shift_templates enable row level security;
alter table public.employee_shift_assignments enable row level security;
alter table public.compensation_profiles enable row level security;
alter table public.employee_requests enable row level security;
alter table public.registration_requests enable row level security;

drop policy if exists "Allow public access for MVP - BranchAttendancePolicies" on public.branch_attendance_policies;
create policy "Allow public access for MVP - BranchAttendancePolicies"
on public.branch_attendance_policies for all
using (true) with check (true);

drop policy if exists "Allow public access for MVP - ShiftTemplates" on public.shift_templates;
create policy "Allow public access for MVP - ShiftTemplates"
on public.shift_templates for all
using (true) with check (true);

drop policy if exists "Allow public access for MVP - ShiftAssignments" on public.employee_shift_assignments;
create policy "Allow public access for MVP - ShiftAssignments"
on public.employee_shift_assignments for all
using (true) with check (true);

drop policy if exists "Allow public access for MVP - CompensationProfiles" on public.compensation_profiles;
create policy "Allow public access for MVP - CompensationProfiles"
on public.compensation_profiles for all
using (true) with check (true);

drop policy if exists "Allow public access for MVP - EmployeeRequests" on public.employee_requests;
create policy "Allow public access for MVP - EmployeeRequests"
on public.employee_requests for all
using (true) with check (true);

drop policy if exists "Allow public access for MVP - RegistrationRequests" on public.registration_requests;
create policy "Allow public access for MVP - RegistrationRequests"
on public.registration_requests for all
using (true) with check (true);

insert into public.branch_attendance_policies (
  branch_id,
  shift_start_time,
  shift_end_time,
  break_minutes,
  late_grace_minutes,
  early_out_grace_minutes,
  minimum_ot_minutes
)
select
  b.id,
  '08:30',
  '17:30',
  60,
  15,
  0,
  30
from public.branches b
on conflict (branch_id) do nothing;

insert into public.compensation_profiles (
  user_id,
  pay_type,
  base_rate,
  ot_rate,
  late_deduction_rate,
  absence_deduction_rate,
  leave_deduction_rate
)
select
  u.id,
  'daily',
  0,
  0,
  0,
  0,
  0
from public.users u
on conflict (user_id) do nothing;

insert into public.shift_templates (
  branch_id,
  name,
  code,
  color,
  start_time,
  end_time,
  break_minutes,
  late_grace_minutes,
  early_out_grace_minutes,
  minimum_ot_minutes
)
select
  b.id,
  'กะปกติ',
  'DAY',
  '#0f766e',
  p.shift_start_time,
  p.shift_end_time,
  p.break_minutes,
  p.late_grace_minutes,
  p.early_out_grace_minutes,
  p.minimum_ot_minutes
from public.branches b
join public.branch_attendance_policies p on p.branch_id = b.id
where not exists (
  select 1
  from public.shift_templates t
  where t.branch_id = b.id
    and t.code = 'DAY'
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    full_name,
    email,
    phone,
    role,
    branch_id,
    team_id,
    status
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    'employee',
    null,
    coalesce(new.raw_user_meta_data->>'team_id', ''),
    'active'
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email;

  insert into public.compensation_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();
