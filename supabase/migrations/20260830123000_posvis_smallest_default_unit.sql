-- POSVis exports one row per sellable package.  The smallest package must be
-- the product default regardless of the row order in the original workbook.
-- Keep the database function defensive as this RPC can also be called without
-- the browser preview.
do $$
declare
  v_definition text;
  v_first_unit_old text := '    v_first_unit := (v_group->''units'')->0;';
  v_first_unit_new text :=
    '    select unit.value into v_first_unit' || chr(10) ||
    '    from jsonb_array_elements(coalesce(v_group->''units'', ''[]''::jsonb)) as unit(value)' || chr(10) ||
    '    order by greatest(0.001, coalesce((unit.value->>''conversion_to_base'')::numeric, 1)),' || chr(10) ||
    '      lower(coalesce(unit.value->>''unit_name'', '''')),' || chr(10) ||
    '      coalesce(unit.value->>''barcode'', '''')' || chr(10) ||
    '    limit 1;';
  v_loop_old text := '    for v_unit in select value from jsonb_array_elements(coalesce(v_group->''units'', ''[]''::jsonb)) loop';
  v_loop_new text :=
    '    for v_unit in' || chr(10) ||
    '      select unit.value from jsonb_array_elements(coalesce(v_group->''units'', ''[]''::jsonb)) as unit(value)' || chr(10) ||
    '      order by greatest(0.001, coalesce((unit.value->>''conversion_to_base'')::numeric, 1)),' || chr(10) ||
    '        lower(coalesce(unit.value->>''unit_name'', '''')),' || chr(10) ||
    '        coalesce(unit.value->>''barcode'', '''')' || chr(10) ||
    '    loop';
  v_insert_old text := 'v_category_id, v_sku, null, v_product_name, ''kg'',';
  v_insert_new text := 'v_category_id, v_sku, null, v_product_name, coalesce(nullif(trim(v_group->>''base_unit_code''), ''''), nullif(trim(v_first_unit->>''base_unit_code''), ''''), ''หน่วย''),';
  v_update_old text := 'base_unit_code = ''kg'',';
  v_update_new text := 'base_unit_code = coalesce(nullif(trim(v_group->>''base_unit_code''), ''''), nullif(trim(v_first_unit->>''base_unit_code''), ''''), ''หน่วย''),';
begin
  select pg_get_functiondef('public.commerce_import_posvis_product_batch(uuid,uuid,uuid,jsonb)'::regprocedure)
  into v_definition;

  if position(v_first_unit_old in v_definition) > 0 then
    v_definition := replace(v_definition, v_first_unit_old, v_first_unit_new);
  end if;
  if position(v_loop_old in v_definition) > 0 then
    v_definition := replace(v_definition, v_loop_old, v_loop_new);
  end if;
  if position(v_insert_old in v_definition) > 0 then
    v_definition := replace(v_definition, v_insert_old, v_insert_new);
  end if;
  if position(v_update_old in v_definition) > 0 then
    v_definition := replace(v_definition, v_update_old, v_update_new);
  end if;

  if position('jsonb_array_elements(coalesce(v_group->''units'', ''[]''::jsonb)) as unit(value)' in v_definition) = 0
    or position('base_unit_code = coalesce(nullif(trim(v_group->>''base_unit_code'')' in v_definition) = 0 then
    raise exception 'Could not update POSVis import unit ordering';
  end if;

  execute v_definition;
end;
$$;

revoke all on function public.commerce_import_posvis_product_batch(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.commerce_import_posvis_product_batch(uuid, uuid, uuid, jsonb) to service_role;
