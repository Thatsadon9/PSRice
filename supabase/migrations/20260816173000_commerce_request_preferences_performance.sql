create or replace function public.commerce_request_context(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(u) || jsonb_build_object(
    'commerceAccess',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'branchId', ura.branch_id,
          'permissionCodes', coalesce((
            select jsonb_agg(rp.permission_code order by rp.permission_code)
            from public.commerce_role_permissions rp
            where rp.role_id = ura.role_id
          ), '[]'::jsonb)
        )
        order by ura.created_at, ura.id
      )
      from public.commerce_user_role_assignments ura
      where ura.user_id = u.id
        and ura.valid_from <= now()
        and (ura.valid_until is null or ura.valid_until > now())
    ), '[]'::jsonb),
    'commercePreferences',
    coalesce((
      select jsonb_build_object(
        'lastBranchId', preferences.last_branch_id,
        'lastTerminalId', preferences.last_terminal_id,
        'sidebarCollapsed', coalesce(preferences.sidebar_collapsed, false),
        'shortcuts', coalesce(preferences.shortcuts, '{"payment":"F9","fullscreen":"F11"}'::jsonb)
      )
      from public.commerce_user_preferences preferences
      where preferences.user_id = u.id
    ), jsonb_build_object(
      'lastBranchId', null,
      'lastTerminalId', null,
      'sidebarCollapsed', false,
      'shortcuts', '{"payment":"F9","fullscreen":"F11"}'::jsonb
    ))
  )
  from public.users u
  where u.id = p_user_id
    and u.status = 'active'::public.user_status;
$$;

revoke all on function public.commerce_request_context(uuid) from public, anon, authenticated;
grant execute on function public.commerce_request_context(uuid) to service_role;
