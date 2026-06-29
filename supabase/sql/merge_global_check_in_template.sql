begin;

create temp table _global_check_in_template (
  id uuid primary key
) on commit drop;

insert into _global_check_in_template (id)
select id
from public.task_templates
where is_system = true
  and branch_id is null
  and title like '%เช็คอิน%'
order by created_at desc
limit 1;

insert into public.task_templates (
  title,
  description,
  priority,
  proof_type_required,
  requires_approval,
  recurrence_rule,
  checklist_json,
  branch_id,
  assigned_to,
  is_system,
  reward_amount
)
select
  coalesce(
    (select title from public.task_templates where is_system = true and title like '%เช็คอิน%' order by created_at desc limit 1),
    'เช็คอินเข้างาน'
  ),
  coalesce(
    (select description from public.task_templates where is_system = true and title like '%เช็คอิน%' order by created_at desc limit 1),
    'เช็คอินเข้างานประจำวันให้สำเร็จ'
  ),
  'medium'::public.priority_level,
  'any'::public.proof_type,
  false,
  'daily'::public.recurrence_type,
  '[]'::jsonb,
  null::uuid,
  null::uuid,
  true,
  coalesce(
    (select reward_amount from public.task_templates where is_system = true and title like '%เช็คอิน%' and reward_amount is not null order by created_at desc limit 1),
    50
  )
where not exists (select 1 from _global_check_in_template);

insert into _global_check_in_template (id)
select id
from public.task_templates
where is_system = true
  and branch_id is null
  and title like '%เช็คอิน%'
order by created_at desc
limit 1
on conflict (id) do nothing;

with check_in_tasks as (
  select
    task.id,
    row_number() over (
      partition by task.assigned_to, task.due_date
      order by
        case task.status
          when 'approved' then 1
          when 'submitted' then 2
          when 'in_progress' then 3
          when 'pending' then 4
          else 5
        end,
        (task.template_id = (select id from _global_check_in_template limit 1)) desc,
        task.created_at desc
    ) as keep_rank
  from public.tasks task
  where task.template_id in (
    select id
    from public.task_templates
    where is_system = true
      and title like '%เช็คอิน%'
  )
)
delete from public.tasks task
using check_in_tasks ranked
where task.id = ranked.id
  and ranked.keep_rank > 1;

update public.tasks task
set template_id = (select id from _global_check_in_template limit 1)
where task.template_id in (
  select id
  from public.task_templates
  where is_system = true
    and branch_id is not null
    and title like '%เช็คอิน%'
);

delete from public.task_templates
where is_system = true
  and branch_id is not null
  and title like '%เช็คอิน%';

commit;
