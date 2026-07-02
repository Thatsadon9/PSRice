-- ========================================================
-- WorkFlow Pro — Migration: Allow Employee to Read Own Admin Branch
-- ========================================================

-- Drop the old policy
drop policy if exists "Authenticated users can read allowed branches" on public.branches;

-- Recreate it with checking if user's own branch_id matches the branch id
create policy "Authenticated users can read allowed branches"
on public.branches for select
to authenticated
using (
  admin_only = false 
  or private.is_admin() 
  or id = private.current_user_branch_id()
);
