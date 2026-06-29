alter table public.task_templates
  alter column branch_id drop not null;

create index if not exists task_templates_global_system_idx
  on public.task_templates(is_system, created_at desc)
  where branch_id is null and is_system = true;
