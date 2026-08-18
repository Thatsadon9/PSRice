-- POSVis imports keep the product master active while individual units carry
-- their own sell status. This matters when one imported package is cancelled
-- but another package of the same product remains sellable.
do $$
declare
  v_definition text;
  v_old_insert text := 'coalesce((v_first_unit->>''can_sell'')::boolean, true), p_actor_user_id,';
  v_old_update text := 'is_active = coalesce((v_first_unit->>''can_sell'')::boolean, true),';
  v_new_update text := 'is_active = true,';
  v_old_rebuild text := '    perform public.commerce_rebuild_product_stock(p_branch_id, v_product_id);';
  v_new_rebuild text := v_old_rebuild || chr(10) ||
    '    update public.products' || chr(10) ||
    '    set is_active = exists (' || chr(10) ||
    '      select 1 from public.product_units pu' || chr(10) ||
    '      where pu.product_id = v_product_id and pu.can_sell = true' || chr(10) ||
    '    ), updated_at = now()' || chr(10) ||
    '    where id = v_product_id;';
begin
  select pg_get_functiondef('public.commerce_import_posvis_product_batch(uuid,uuid,uuid,jsonb)'::regprocedure)
  into v_definition;

  if position(v_old_insert in v_definition) > 0
    and position(v_old_update in v_definition) > 0
    and position(v_old_rebuild in v_definition) > 0 then
    v_definition := replace(v_definition, v_old_insert, 'true, p_actor_user_id,');
    v_definition := replace(v_definition, v_old_update, v_new_update);
    v_definition := replace(v_definition, v_old_rebuild, v_new_rebuild);
    execute v_definition;
  end if;
end $$;

revoke all on function public.commerce_import_posvis_product_batch(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.commerce_import_posvis_product_batch(uuid, uuid, uuid, jsonb)
  to service_role;
