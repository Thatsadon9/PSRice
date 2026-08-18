do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.commerce_finalize_pos_sale(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,text)'::regprocedure)
  into v_definition;
  v_definition := replace(v_definition,
    '  v_register_status text;' || chr(10) || 'begin',
    '  v_register_status text;' || chr(10) || '  v_customer_type text := ''retail'';' || chr(10) || 'begin');
  v_definition := replace(v_definition,
    '  if p_register_session_id is not null then',
    '  if p_customer_id is not null then' || chr(10) ||
    '    select customer_type into v_customer_type from public.customers where id = p_customer_id and is_active;' || chr(10) ||
    '    if not found then raise exception ''active customer not found'' using errcode = ''22023''; end if;' || chr(10) ||
    '  end if;' || chr(10) || chr(10) ||
    '  if p_register_session_id is not null then');
  v_definition := replace(v_definition, 'and pp.customer_type = ''retail''', 'and pp.customer_type = v_customer_type');
  execute v_definition;
end $$;

revoke all on function public.commerce_finalize_pos_sale(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.commerce_finalize_pos_sale(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,text) to service_role;
