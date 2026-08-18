create unique index if not exists commerce_user_role_assignments_global_role_unique
  on public.commerce_user_role_assignments(user_id, role_id)
  where branch_id is null;
