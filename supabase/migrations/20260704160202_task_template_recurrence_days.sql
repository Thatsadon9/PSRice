alter table public.task_templates
  add column if not exists recurrence_days smallint[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_templates_recurrence_days_chk'
      and conrelid = 'public.task_templates'::regclass
  ) then
    alter table public.task_templates
      add constraint task_templates_recurrence_days_chk
      check (
        recurrence_days is null
        or (
          cardinality(recurrence_days) between 1 and 7
          and recurrence_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
        )
      ) not valid;
  end if;
end $$;

create index if not exists task_templates_recurrence_rule_idx
  on public.task_templates(recurrence_rule);
