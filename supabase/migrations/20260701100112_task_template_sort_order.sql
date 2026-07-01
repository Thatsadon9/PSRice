alter table public.task_templates
  add column if not exists sort_order integer;

with ordered_templates as (
  select
    id,
    row_number() over (
      partition by branch_id
      order by created_at desc, id
    ) as next_sort_order
  from public.task_templates
)
update public.task_templates template
set sort_order = ordered_templates.next_sort_order
from ordered_templates
where template.id = ordered_templates.id
  and template.sort_order is null;

alter table public.task_templates
  alter column sort_order set not null;

create or replace function public.set_task_template_sort_order()
returns trigger
language plpgsql
as $$
begin
  if new.sort_order is null or new.sort_order <= 0 then
    select coalesce(max(template.sort_order), 0) + 1
    into new.sort_order
    from public.task_templates template
    where template.branch_id is not distinct from new.branch_id;
  end if;

  return new;
end;
$$;

revoke execute on function public.set_task_template_sort_order() from public;

drop trigger if exists task_templates_set_sort_order
  on public.task_templates;

create trigger task_templates_set_sort_order
before insert on public.task_templates
for each row
execute function public.set_task_template_sort_order();

create index if not exists task_templates_branch_sort_order_idx
  on public.task_templates(branch_id, sort_order, created_at desc);

create index if not exists task_templates_sort_order_idx
  on public.task_templates(sort_order, created_at desc);
