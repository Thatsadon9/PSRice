do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_unit_reward_quantity_bounds_chk'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_unit_reward_quantity_bounds_chk
      check (
        reward_type <> 'unit'
        or (
          (submitted_quantity is null or (
            submitted_quantity > 0
            and (unit_min is null or submitted_quantity >= unit_min)
            and (unit_max is null or submitted_quantity <= unit_max)
          ))
          and (approved_quantity is null or (
            approved_quantity > 0
            and (unit_min is null or approved_quantity >= unit_min)
            and (unit_max is null or approved_quantity <= unit_max)
          ))
        )
      ) not valid;
  end if;
end $$;

create or replace function public.enforce_unit_submission_quantity_bounds()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  task_bounds record;
begin
  select
    task.reward_type,
    task.unit_min,
    task.unit_max
  into task_bounds
  from public.tasks task
  where task.id = new.task_id;

  if task_bounds.reward_type = 'unit' then
    if new.submitted_quantity is null or new.submitted_quantity <= 0 then
      raise check_violation using message = 'submitted_quantity is required for unit reward tasks';
    end if;

    if task_bounds.unit_min is not null and new.submitted_quantity < task_bounds.unit_min then
      raise check_violation using message = 'submitted_quantity is below the task minimum';
    end if;

    if task_bounds.unit_max is not null and new.submitted_quantity > task_bounds.unit_max then
      raise check_violation using message = 'submitted_quantity exceeds the task maximum';
    end if;

    if new.approved_quantity is not null then
      if new.approved_quantity <= 0 then
        raise check_violation using message = 'approved_quantity must be greater than zero';
      end if;

      if task_bounds.unit_min is not null and new.approved_quantity < task_bounds.unit_min then
        raise check_violation using message = 'approved_quantity is below the task minimum';
      end if;

      if task_bounds.unit_max is not null and new.approved_quantity > task_bounds.unit_max then
        raise check_violation using message = 'approved_quantity exceeds the task maximum';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_unit_submission_quantity_bounds() from public, anon, authenticated;

drop trigger if exists enforce_unit_submission_quantity_bounds_trigger on public.task_submissions;

create trigger enforce_unit_submission_quantity_bounds_trigger
before insert or update of task_id, submitted_quantity, approved_quantity
on public.task_submissions
for each row
execute function public.enforce_unit_submission_quantity_bounds();
