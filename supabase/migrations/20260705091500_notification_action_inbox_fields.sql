alter table public.notifications
  add column if not exists category text
    check (category is null or category in ('action', 'update', 'system')),
  add column if not exists priority text
    check (priority is null or priority in ('low', 'medium', 'high', 'critical')),
  add column if not exists status text
    check (status is null or status in ('unread', 'read', 'done', 'archived')),
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists actor_user_id uuid references public.users(id) on delete set null,
  add column if not exists branch_id uuid references public.branches(id) on delete set null,
  add column if not exists group_key text,
  add column if not exists archived_at timestamp with time zone;

update public.notifications
set
  status = case when is_read then 'read' else 'unread' end,
  category = case
    when type = 'review' then 'action'
    when type = 'system' and (
      title ilike '%คำขอ%' or title ilike '%สมัคร%' or message ilike '%รออนุมัติ%'
    ) then 'action'
    when type = 'system' then 'system'
    else 'update'
  end,
  priority = case
    when type = 'review' then 'high'
    when type = 'system' and message ilike '%ล้มเหลว%' then 'critical'
    else 'medium'
  end
where status is null or category is null or priority is null;

create index if not exists notifications_user_status_created_idx
on public.notifications(user_id, status, created_at desc);

create index if not exists notifications_user_category_created_idx
on public.notifications(user_id, category, created_at desc);

create index if not exists notifications_user_archived_created_idx
on public.notifications(user_id, archived_at, created_at desc);

create index if not exists notifications_group_key_idx
on public.notifications(group_key)
where group_key is not null;

alter table public.notifications
  alter column category set default 'update',
  alter column priority set default 'medium',
  alter column status set default 'unread';
