alter table public.task_templates
  add column if not exists assigned_to uuid;

alter table public.task_templates
  drop constraint if exists task_templates_assigned_to_fkey;

alter table public.task_templates
  add constraint task_templates_assigned_to_fkey
  foreign key (assigned_to)
  references public.users(id)
  on delete set null;

create index if not exists task_templates_assigned_to_idx
  on public.task_templates(assigned_to)
  where assigned_to is not null;

create index if not exists task_templates_recurrence_assignee_idx
  on public.task_templates(recurrence_rule, assigned_to)
  where assigned_to is not null;
