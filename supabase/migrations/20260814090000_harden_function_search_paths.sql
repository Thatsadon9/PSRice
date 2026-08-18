-- Prevent object-name shadowing inside trigger functions, especially the
-- SECURITY DEFINER auth profile trigger.
alter function public.handle_new_user()
  set search_path = '';

alter function public.set_updated_at_timestamp()
  set search_path = '';

alter function public.set_task_template_sort_order()
  set search_path = '';
