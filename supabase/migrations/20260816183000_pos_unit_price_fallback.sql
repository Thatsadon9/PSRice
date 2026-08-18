-- Keep the POS transaction price resolver consistent with the bootstrap catalog.
-- When a unit has no explicit customer/branch price, its price is the base
-- product price multiplied by the unit conversion (for example 7 x 6 = 42).
do $$
declare
  v_definition text;
  v_before text := '    v_unit_price := coalesce(v_unit_price, v_default_price);';
  v_after text := '    v_unit_price := coalesce(v_unit_price, v_default_price * v_conversion);';
begin
  select pg_get_functiondef('public.commerce_finalize_pos_sale(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,text)'::regprocedure)
  into v_definition;

  if position(v_after in v_definition) = 0 then
    if position(v_before in v_definition) = 0 then
      raise exception 'Could not apply POS unit price fallback fix to commerce_finalize_pos_sale';
    end if;
    execute replace(v_definition, v_before, v_after);
  end if;
end $$;

revoke all on function public.commerce_finalize_pos_sale(uuid, uuid, uuid, uuid, jsonb, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.commerce_finalize_pos_sale(uuid, uuid, uuid, uuid, jsonb, jsonb, uuid, text)
  to service_role;
