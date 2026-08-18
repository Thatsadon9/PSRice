-- Workforce branches predate Commerce and did not originally have an active flag.
-- The flag lets document RPCs reject retired branches without deleting history.
alter table public.branches
  add column if not exists is_active boolean not null default true;
