-- POSVis cut-over storage. Product masters are global, while the operational
-- values and opening stock remain branch + unit specific.

alter table public.migration_batches
  add column if not exists branch_id uuid references public.branches(id) on delete restrict;

create index if not exists migration_batches_branch_created_idx
  on public.migration_batches(branch_id, created_at desc);

create table if not exists public.branch_product_unit_settings (
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  product_unit_id uuid not null references public.product_units(id) on delete cascade,
  cost_price numeric(14,2) check (cost_price is null or cost_price >= 0),
  reorder_point numeric(18,3) check (reorder_point is null or reorder_point >= 0),
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (branch_id, product_unit_id),
  unique (branch_id, product_id, product_unit_id)
);

comment on table public.branch_product_unit_settings is
  'Branch-specific cost and reorder settings for each sellable/receivable product unit.';

create index if not exists branch_product_unit_settings_product_idx
  on public.branch_product_unit_settings(branch_id, product_id);

drop trigger if exists branch_product_unit_settings_set_updated_at on public.branch_product_unit_settings;
create trigger branch_product_unit_settings_set_updated_at
before update on public.branch_product_unit_settings
for each row execute function public.set_updated_at_timestamp();

alter table public.branch_product_unit_settings enable row level security;
revoke all on public.branch_product_unit_settings from anon, authenticated;
grant all privileges on public.branch_product_unit_settings to service_role;
drop policy if exists commerce_server_only on public.branch_product_unit_settings;
create policy commerce_server_only on public.branch_product_unit_settings
  for all to authenticated using (false) with check (false);

-- The server prepares the normalized preview and sends the grouped payload here.
-- All writes, barcode checks, price/cost writes, opening movements and migration
-- maps are kept in one database transaction.
create or replace function public.commerce_import_posvis_product_batch(
  p_batch_id uuid,
  p_branch_id uuid,
  p_actor_user_id uuid,
  p_groups jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group jsonb;
  v_unit jsonb;
  v_first_unit jsonb;
  v_category_id uuid;
  v_product_id uuid;
  v_product_unit_id uuid;
  v_existing_product_id uuid;
  v_existing_unit_id uuid;
  v_unit_code text;
  v_barcode text;
  v_group_key text;
  v_category_name text;
  v_product_name text;
  v_sku text;
  v_current numeric(18,3);
  v_incoming numeric(18,3);
  v_cost numeric(14,2);
  v_price numeric(14,2);
  v_reorder numeric(18,3);
  v_conversion numeric(18,3);
  v_can_sell boolean;
  v_can_receive boolean;
  v_is_first_unit boolean;
  v_product_count integer := 0;
  v_unit_count integer := 0;
  v_stock_count integer := 0;
  v_existing_movement boolean;
begin
  if p_batch_id is null or p_branch_id is null or p_actor_user_id is null then
    raise exception 'POSVis import requires batch, branch and actor';
  end if;

  if not exists (select 1 from public.migration_batches where id = p_batch_id and data_type = 'posvis_products') then
    raise exception 'POSVis migration batch not found';
  end if;

  if not exists (select 1 from public.branches where id = p_branch_id) then
    raise exception 'POSVis branch not found';
  end if;

  for v_group in select value from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) loop
    v_group_key := nullif(trim(v_group->>'group_key'), '');
    v_category_name := nullif(trim(v_group->>'category_name'), '');
    v_product_name := nullif(trim(v_group->>'name'), '');
    v_sku := nullif(trim(v_group->>'sku'), '');
    v_first_unit := (v_group->'units')->0;

    if v_group_key is null or v_product_name is null or v_sku is null or v_first_unit is null then
      raise exception 'POSVis group is incomplete';
    end if;

    select id into v_category_id
    from public.product_categories
    where name = coalesce(v_category_name, 'ไม่ระบุหมวดหมู่')
    limit 1;

    if v_category_id is null then
      insert into public.product_categories(name)
      values (coalesce(v_category_name, 'ไม่ระบุหมวดหมู่'))
      returning id into v_category_id;
    end if;

    select id into v_product_id from public.products where sku = v_sku for update;
    if v_product_id is null then
      insert into public.products(
        category_id, sku, barcode, name, base_unit_code,
        default_sale_price, default_cost_price, reorder_point,
        is_active, created_by, external_ref, unit_inventory_mode
      ) values (
        v_category_id, v_sku, null, v_product_name, 'kg',
        greatest(0, coalesce((v_first_unit->>'sale_price')::numeric, 0)),
        greatest(0, coalesce((v_first_unit->>'cost_price')::numeric, 0)),
        greatest(0, coalesce((v_first_unit->>'reorder_point')::numeric, 0)),
        true, p_actor_user_id,
        'posvis-group:' || v_group_key, 'separate_unit'
      ) returning id into v_product_id;
    else
      update public.products set
        category_id = v_category_id,
        name = v_product_name,
        barcode = null,
        base_unit_code = 'kg',
        default_sale_price = greatest(0, coalesce((v_first_unit->>'sale_price')::numeric, 0)),
        default_cost_price = greatest(0, coalesce((v_first_unit->>'cost_price')::numeric, 0)),
        reorder_point = greatest(0, coalesce((v_first_unit->>'reorder_point')::numeric, 0)),
        is_active = true,
        external_ref = 'posvis-group:' || v_group_key,
        unit_inventory_mode = 'separate_unit',
        updated_at = now()
      where id = v_product_id;
    end if;
    v_product_count := v_product_count + 1;

    v_is_first_unit := true;
    for v_unit in select value from jsonb_array_elements(coalesce(v_group->'units', '[]'::jsonb)) loop
      v_unit_code := nullif(trim(v_unit->>'unit_code'), '');
      v_barcode := nullif(trim(v_unit->>'barcode'), '');
      v_incoming := greatest(0, coalesce((v_unit->>'stock')::numeric, 0));
      v_cost := greatest(0, coalesce((v_unit->>'cost_price')::numeric, 0));
      v_price := greatest(0, coalesce((v_unit->>'sale_price')::numeric, 0));
      v_reorder := greatest(0, coalesce((v_unit->>'reorder_point')::numeric, 0));
      v_conversion := greatest(0.001, coalesce((v_unit->>'conversion_to_base')::numeric, 1));
      v_can_sell := coalesce((v_unit->>'can_sell')::boolean, true);
      v_can_receive := coalesce((v_unit->>'can_receive')::boolean, true);
      v_existing_unit_id := null;
      v_existing_product_id := null;
      v_product_unit_id := null;

      if v_unit_code is null then raise exception 'POSVis unit code is missing'; end if;
      if v_barcode is not null then
        select pu.id, pu.product_id into v_existing_unit_id, v_existing_product_id
        from public.product_units pu where pu.barcode = v_barcode limit 1 for update;
        if v_existing_unit_id is not null and v_existing_product_id <> v_product_id then
          raise exception 'POSVIS_BARCODE_CONFLICT:%', v_barcode using errcode = 'P0001';
        end if;
        if v_existing_unit_id is not null then
          v_product_unit_id := v_existing_unit_id;
        end if;
      end if;

      if v_product_unit_id is null then
        select pu.id into v_product_unit_id
        from public.product_units pu
        where pu.product_id = v_product_id and pu.code = v_unit_code
        for update;
      end if;
      if v_product_unit_id is null then
        insert into public.product_units(product_id, code, name, conversion_to_base, barcode, is_default, can_sell, can_receive)
        values (v_product_id, v_unit_code, coalesce(nullif(trim(v_unit->>'unit_name'), ''), v_unit_code), v_conversion, v_barcode, v_is_first_unit, v_can_sell, v_can_receive)
        returning id into v_product_unit_id;
      else
        update public.product_units set
          name = coalesce(nullif(trim(v_unit->>'unit_name'), ''), v_unit_code),
          conversion_to_base = v_conversion,
          barcode = v_barcode,
          is_default = v_is_first_unit,
          can_sell = v_can_sell,
          can_receive = v_can_receive,
          updated_at = now()
        where id = v_product_unit_id;
      end if;
      if v_is_first_unit then
        update public.product_units set is_default = false where product_id = v_product_id and id <> v_product_unit_id;
      end if;
      v_is_first_unit := false;
      v_unit_count := v_unit_count + 1;

      update public.product_prices set
        price = v_price,
        priority = -100,
        minimum_quantity = 0,
        starts_at = null,
        ends_at = null,
        is_active = true,
        is_inventory_default = true,
        updated_at = now()
      where product_id = v_product_id and product_unit_id = v_product_unit_id
        and branch_id = p_branch_id and customer_type = 'retail'
        and is_inventory_default = true;
      if not found then
        insert into public.product_prices(product_id, product_unit_id, branch_id, customer_type, minimum_quantity, price, priority, is_active, is_inventory_default)
        values (v_product_id, v_product_unit_id, p_branch_id, 'retail', 0, v_price, -100, true, true);
      end if;

      insert into public.branch_product_unit_settings(branch_id, product_id, product_unit_id, cost_price, reorder_point, updated_by_user_id)
      values (p_branch_id, v_product_id, v_product_unit_id, v_cost, v_reorder, p_actor_user_id)
      on conflict (branch_id, product_unit_id) do update set
        product_id = excluded.product_id,
        cost_price = excluded.cost_price,
        reorder_point = excluded.reorder_point,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = now();

      select s.on_hand into v_current
      from public.stock_unit_balances s
      where s.branch_id = p_branch_id and s.product_unit_id = v_product_unit_id
      for update;
      v_current := coalesce(v_current, 0);
      select exists(
        select 1 from public.stock_unit_movements m
        where m.branch_id = p_branch_id and m.product_unit_id = v_product_unit_id
          and m.reference_type = 'migration_batch' and m.reference_id = p_batch_id
      ) into v_existing_movement;

      if not v_existing_movement and v_current <> 0 then
        raise exception 'POSVIS_EXISTING_STOCK_CONFLICT:%', v_barcode;
      end if;
      if not v_existing_movement then
        insert into public.stock_unit_balances(branch_id, product_id, product_unit_id, on_hand, reserved, damaged, in_transit)
        values (p_branch_id, v_product_id, v_product_unit_id, v_incoming, 0, 0, 0)
        on conflict (branch_id, product_unit_id) do update set on_hand = excluded.on_hand, updated_at = now();
        if v_incoming <> 0 then
          insert into public.stock_unit_movements(branch_id, product_id, product_unit_id, movement_type, quantity_before, quantity_delta, quantity_after, base_quantity_delta, reference_type, reference_id, note, performed_by_user_id)
          values (p_branch_id, v_product_id, v_product_unit_id, 'opening', v_current, v_incoming - v_current, v_incoming, round((v_incoming - v_current) * v_conversion, 3), 'migration_batch', p_batch_id, 'POSVis cut-over opening stock', p_actor_user_id);
          v_stock_count := v_stock_count + 1;
        end if;
      end if;

      insert into public.migration_id_map(source_system, entity_type, external_ref, internal_id, migration_batch_id)
      values ('posvis', 'product_unit', coalesce(nullif(trim(v_unit->>'external_ref'), ''), v_barcode, v_unit_code), v_product_unit_id, p_batch_id)
      on conflict (source_system, entity_type, external_ref) do update set internal_id = excluded.internal_id, migration_batch_id = excluded.migration_batch_id;
      update public.migration_rows set status = 'imported', imported_entity_type = 'product_unit', imported_entity_id = v_product_unit_id
      where migration_batch_id = p_batch_id and external_ref = coalesce(nullif(trim(v_unit->>'external_ref'), ''), v_barcode, v_unit_code);
    end loop;
    perform public.commerce_rebuild_product_stock(p_branch_id, v_product_id);
    update public.products
    set is_active = exists (
      select 1 from public.product_units pu
      where pu.product_id = v_product_id and pu.can_sell = true
    ), updated_at = now()
    where id = v_product_id;
    insert into public.migration_id_map(source_system, entity_type, external_ref, internal_id, migration_batch_id)
    values ('posvis', 'product', 'posvis-group:' || v_group_key, v_product_id, p_batch_id)
    on conflict (source_system, entity_type, external_ref) do update set internal_id = excluded.internal_id, migration_batch_id = excluded.migration_batch_id;
  end loop;

  insert into public.commerce_audit_logs(actor_user_id, branch_id, action, entity_type, entity_id, payload)
  values (p_actor_user_id, p_branch_id, 'migration.posvis_products.committed', 'migration_batch', p_batch_id,
    jsonb_build_object('products', v_product_count, 'units', v_unit_count, 'stock_units', v_stock_count));

  return jsonb_build_object('products', v_product_count, 'units', v_unit_count, 'stock_units', v_stock_count);
end;
$$;

revoke all on function public.commerce_import_posvis_product_batch(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.commerce_import_posvis_product_batch(uuid, uuid, uuid, jsonb) to service_role;

-- Use the imported branch + unit cost for POS cost snapshots. Existing
-- product-level branch settings remain the fallback for older products.
do $$
declare
  v_definition text;
  v_select_before text := 'select p.name, p.default_sale_price, coalesce(bis.cost_price, p.default_cost_price), pu.name, pu.conversion_to_base';
  v_select_after text := 'select p.name, p.default_sale_price, coalesce(bpus.cost_price, bis.cost_price, p.default_cost_price * pu.conversion_to_base), pu.name, pu.conversion_to_base';
  v_join_before text := 'left join public.branch_inventory_settings bis on bis.branch_id = p_branch_id and bis.product_id = p.id';
  v_join_after text := v_join_before || chr(10) ||
    '    left join public.branch_product_unit_settings bpus on bpus.branch_id = p_branch_id and bpus.product_id = p.id and bpus.product_unit_id = v_product_unit_id';
begin
  select pg_get_functiondef('public.commerce_finalize_pos_sale(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,text)'::regprocedure)
  into v_definition;

  if position('branch_product_unit_settings bpus' in v_definition) = 0 then
    if position(v_select_before in v_definition) = 0 or position(v_join_before in v_definition) = 0 then
      raise exception 'Could not apply POS per-unit cost to commerce_finalize_pos_sale';
    end if;
    execute replace(replace(v_definition, v_select_before, v_select_after), v_join_before, v_join_after);
  end if;
end $$;

revoke all on function public.commerce_finalize_pos_sale(uuid, uuid, uuid, uuid, jsonb, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.commerce_finalize_pos_sale(uuid, uuid, uuid, uuid, jsonb, jsonb, uuid, text)
  to service_role;
