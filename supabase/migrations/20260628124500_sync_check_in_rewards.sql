-- Align check-in reward data with the effective attendance settings.
-- This repairs stale pending tasks/templates that may have kept an older
-- reward_amount after the global default was changed.

do $$
declare
  check_in_keyword text := U&'\0E40\0E0A\0E47\0E04\0E2D\0E34\0E19';
begin
  if to_regclass('public.app_settings') is null
    or to_regclass('public.branch_attendance_policies') is null
    or to_regclass('public.task_templates') is null
    or to_regclass('public.tasks') is null
    or to_regclass('public.users') is null then
    return;
  end if;

  with default_reward as (
    select coalesce(
      (
        select case
          when trim(both '"' from value::text) ~ '^[0-9]+$' then trim(both '"' from value::text)::integer
          else null
        end
        from public.app_settings
        where key = 'default_check_in_reward'
        limit 1
      ),
      50
    ) as amount
  )
  update public.branch_attendance_policies policy
  set
    check_in_reward = default_reward.amount,
    updated_at = now()
  from default_reward
  where policy.use_default_check_in_reward is not false
    and policy.check_in_reward is distinct from default_reward.amount;

  with default_reward as (
    select coalesce(
      (
        select case
          when trim(both '"' from value::text) ~ '^[0-9]+$' then trim(both '"' from value::text)::integer
          else null
        end
        from public.app_settings
        where key = 'default_check_in_reward'
        limit 1
      ),
      50
    ) as amount
  ),
  effective_policy as (
    select
      policy.branch_id,
      case
        when policy.use_default_check_in_reward is not false then default_reward.amount
        else coalesce(policy.check_in_reward, default_reward.amount)
      end as amount
    from public.branch_attendance_policies policy
    cross join default_reward
  )
  update public.task_templates template
  set reward_amount = effective_policy.amount
  from effective_policy
  where template.branch_id = effective_policy.branch_id
    and template.is_system is true
    and template.title like '%' || check_in_keyword || '%'
    and template.reward_amount is distinct from effective_policy.amount;

  with default_reward as (
    select coalesce(
      (
        select case
          when trim(both '"' from value::text) ~ '^[0-9]+$' then trim(both '"' from value::text)::integer
          else null
        end
        from public.app_settings
        where key = 'default_check_in_reward'
        limit 1
      ),
      50
    ) as amount
  ),
  effective_policy as (
    select
      policy.branch_id,
      case
        when policy.use_default_check_in_reward is not false then default_reward.amount
        else coalesce(policy.check_in_reward, default_reward.amount)
      end as amount
    from public.branch_attendance_policies policy
    cross join default_reward
  )
  update public.tasks task
  set reward_amount = effective_policy.amount
  from public.users employee
  join effective_policy on effective_policy.branch_id = employee.branch_id
  where task.assigned_to = employee.id
    and task.status = 'pending'
    and task.title like '%' || check_in_keyword || '%'
    and task.reward_amount is distinct from effective_policy.amount;
end $$;
