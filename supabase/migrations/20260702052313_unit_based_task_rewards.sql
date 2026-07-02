alter table public.task_templates
  add column if not exists reward_type text not null default 'fixed',
  add column if not exists unit_label text,
  add column if not exists unit_rate numeric(12,2),
  add column if not exists unit_step numeric(12,2) not null default 1,
  add column if not exists unit_min numeric(12,2),
  add column if not exists unit_max numeric(12,2),
  add column if not exists target_quantity numeric(12,2);

alter table public.tasks
  add column if not exists reward_type text not null default 'fixed',
  add column if not exists unit_label text,
  add column if not exists unit_rate numeric(12,2),
  add column if not exists unit_step numeric(12,2) not null default 1,
  add column if not exists unit_min numeric(12,2),
  add column if not exists unit_max numeric(12,2),
  add column if not exists target_quantity numeric(12,2),
  add column if not exists submitted_quantity numeric(12,2),
  add column if not exists approved_quantity numeric(12,2),
  add column if not exists approved_reward_amount numeric(12,2);

alter table public.task_submissions
  add column if not exists submitted_quantity numeric(12,2),
  add column if not exists approved_quantity numeric(12,2),
  add column if not exists approved_reward_amount numeric(12,2);

update public.task_templates
set reward_type = 'fixed'
where reward_type is null;

update public.tasks
set reward_type = 'fixed'
where reward_type is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_templates_reward_type_chk'
      and conrelid = 'public.task_templates'::regclass
  ) then
    alter table public.task_templates
      add constraint task_templates_reward_type_chk
      check (reward_type in ('fixed', 'unit')) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_reward_type_chk'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_reward_type_chk
      check (reward_type in ('fixed', 'unit')) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_templates_unit_reward_values_chk'
      and conrelid = 'public.task_templates'::regclass
  ) then
    alter table public.task_templates
      add constraint task_templates_unit_reward_values_chk
      check (
        (unit_rate is null or unit_rate >= 0)
        and unit_step > 0
        and (unit_min is null or unit_min >= 0)
        and (unit_max is null or unit_max >= 0)
        and (target_quantity is null or target_quantity >= 0)
        and (unit_min is null or unit_max is null or unit_min <= unit_max)
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_unit_reward_values_chk'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_unit_reward_values_chk
      check (
        (unit_rate is null or unit_rate >= 0)
        and unit_step > 0
        and (unit_min is null or unit_min >= 0)
        and (unit_max is null or unit_max >= 0)
        and (target_quantity is null or target_quantity >= 0)
        and (submitted_quantity is null or submitted_quantity >= 0)
        and (approved_quantity is null or approved_quantity >= 0)
        and (approved_reward_amount is null or approved_reward_amount >= 0)
        and (unit_min is null or unit_max is null or unit_min <= unit_max)
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_submissions_unit_reward_values_chk'
      and conrelid = 'public.task_submissions'::regclass
  ) then
    alter table public.task_submissions
      add constraint task_submissions_unit_reward_values_chk
      check (
        (submitted_quantity is null or submitted_quantity >= 0)
        and (approved_quantity is null or approved_quantity >= 0)
        and (approved_reward_amount is null or approved_reward_amount >= 0)
      ) not valid;
  end if;
end $$;

create index if not exists task_templates_reward_type_idx
  on public.task_templates(reward_type);

create index if not exists tasks_reward_type_status_idx
  on public.tasks(reward_type, status)
  where reward_type = 'unit';
