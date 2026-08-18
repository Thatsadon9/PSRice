-- Keep unit-level inventory configuration and the POS sale guard aligned with
-- the POSVis import model.  Separate-unit products must never fall back to
-- their product-level cost or stock when an operator edits one unit.

create index if not exists branch_product_unit_settings_product_fk_idx
  on public.branch_product_unit_settings(product_id);

create index if not exists branch_product_unit_settings_unit_fk_idx
  on public.branch_product_unit_settings(product_unit_id);

create index if not exists branch_product_unit_settings_updated_by_fk_idx
  on public.branch_product_unit_settings(updated_by_user_id);

alter table public.branch_product_unit_settings
  add column if not exists note text;

create or replace function public.commerce_configure_branch_inventory_unit_item(
  p_user_id uuid,
  p_branch_id uuid,
  p_product_id uuid,
  p_product_unit_id uuid,
  p_sale_price numeric,
  p_cost_price numeric,
  p_reorder_point numeric,
  p_quantity_after numeric,
  p_is_active boolean,
  p_note text default null,
  p_stock_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_balance public.stock_unit_balances%rowtype;
  v_delta numeric(18,3);
  v_adjustment_id uuid;
  v_previous_settings jsonb;
begin
  if p_user_id is null or p_branch_id is null or p_product_id is null or p_product_unit_id is null
    or p_sale_price is null or p_sale_price < 0
    or p_cost_price is null or p_cost_price < 0
    or p_reorder_point is null or p_reorder_point < 0
    or p_quantity_after is null or p_quantity_after < 0
    or p_is_active is null then
    raise exception 'invalid branch inventory unit configuration' using errcode = '22023';
  end if;

  if not public.commerce_has_permission(p_user_id, 'inventory.adjust', p_branch_id)
    or not public.commerce_has_permission(p_user_id, 'pricing.manage', p_branch_id) then
    raise exception 'branch inventory configuration access denied' using errcode = '42501';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and unit_inventory_mode = 'separate_unit'
  for update;
  if not found then
    raise exception 'product does not use separate unit inventory' using errcode = '22023';
  end if;

  select * into v_unit
  from public.product_units
  where id = p_product_unit_id and product_id = p_product_id
  for update;
  if not found then
    raise exception 'product unit not found' using errcode = '22023';
  end if;

  insert into public.stock_unit_balances(branch_id, product_id, product_unit_id)
  values (p_branch_id, p_product_id, p_product_unit_id)
  on conflict (branch_id, product_unit_id) do nothing;

  select * into v_balance
  from public.stock_unit_balances
  where branch_id = p_branch_id and product_unit_id = p_product_unit_id
  for update;

  if p_quantity_after < v_balance.reserved + v_balance.damaged then
    raise exception 'unit stock cannot be lower than reserved or damaged stock' using errcode = '22023';
  end if;

  v_delta := round(p_quantity_after - v_balance.on_hand, 3);
  if v_delta <> 0 and coalesce(trim(p_stock_reason), '') = '' then
    raise exception 'stock adjustment reason is required' using errcode = '22023';
  end if;

  v_previous_settings := jsonb_build_object(
    'sale_price', coalesce((select pp.price from public.product_prices pp where pp.product_id = p_product_id and pp.product_unit_id = p_product_unit_id and pp.branch_id = p_branch_id and pp.customer_type = 'retail' and pp.is_inventory_default = true and pp.is_active order by pp.updated_at desc limit 1), v_product.default_sale_price * v_unit.conversion_to_base),
    'cost_price', coalesce((select bpus.cost_price from public.branch_product_unit_settings bpus where bpus.branch_id = p_branch_id and bpus.product_unit_id = p_product_unit_id), v_product.default_cost_price * v_unit.conversion_to_base),
    'reorder_point', coalesce((select bpus.reorder_point from public.branch_product_unit_settings bpus where bpus.branch_id = p_branch_id and bpus.product_unit_id = p_product_unit_id), 0),
    'quantity', v_balance.on_hand,
    'is_active', coalesce((select bpa.is_active from public.branch_product_availability bpa where bpa.branch_id = p_branch_id and bpa.product_id = p_product_id), true),
    'note', (select bpus.note from public.branch_product_unit_settings bpus where bpus.branch_id = p_branch_id and bpus.product_unit_id = p_product_unit_id)
  );

  insert into public.branch_product_unit_settings(
    branch_id, product_id, product_unit_id, cost_price, reorder_point, note, updated_by_user_id
  ) values (
    p_branch_id, p_product_id, p_product_unit_id, p_cost_price, p_reorder_point,
    nullif(trim(coalesce(p_note, '')), ''), p_user_id
  )
  on conflict (branch_id, product_unit_id) do update set
    product_id = excluded.product_id,
    cost_price = excluded.cost_price,
    reorder_point = excluded.reorder_point,
    note = excluded.note,
    updated_by_user_id = excluded.updated_by_user_id,
    updated_at = now();

  insert into public.branch_product_availability(branch_id, product_id, is_active, updated_by_user_id)
  values (p_branch_id, p_product_id, p_is_active, p_user_id)
  on conflict (branch_id, product_id) do update set
    is_active = excluded.is_active,
    updated_by_user_id = excluded.updated_by_user_id,
    updated_at = now();

  update public.product_prices
  set price = p_sale_price,
      priority = -100,
      minimum_quantity = 0,
      starts_at = null,
      ends_at = null,
      is_active = true,
      updated_at = now()
  where product_id = p_product_id
    and product_unit_id = p_product_unit_id
    and branch_id = p_branch_id
    and customer_type = 'retail'
    and is_inventory_default = true;

  if not found then
    insert into public.product_prices(
      product_id, product_unit_id, branch_id, customer_type, minimum_quantity,
      price, priority, is_active, is_inventory_default
    ) values (
      p_product_id, p_product_unit_id, p_branch_id, 'retail', 0,
      p_sale_price, -100, true, true
    );
  end if;

  if v_delta <> 0 then
    update public.stock_unit_balances
    set on_hand = p_quantity_after, updated_at = now()
    where branch_id = p_branch_id and product_unit_id = p_product_unit_id;

    insert into public.stock_unit_movements(
      branch_id, product_id, product_unit_id, movement_type,
      quantity_before, quantity_delta, quantity_after, base_quantity_delta,
      reference_type, note, performed_by_user_id
    ) values (
      p_branch_id, p_product_id, p_product_unit_id,
      case when v_delta > 0 then 'adjustment_in' else 'adjustment_out' end,
      v_balance.on_hand, v_delta, p_quantity_after,
      round(v_delta * v_unit.conversion_to_base, 3),
      'stock_unit_adjustment', nullif(trim(coalesce(p_note, '')), ''), p_user_id
    ) returning id into v_adjustment_id;

    perform public.commerce_rebuild_product_stock(p_branch_id, p_product_id);
  end if;

  insert into public.commerce_audit_logs(actor_user_id, branch_id, action, entity_type, entity_id, payload)
  values (
    p_user_id, p_branch_id, 'inventory.branch_unit.configured', 'product_unit', p_product_unit_id,
    jsonb_build_object(
      'product_id', p_product_id,
      'before', v_previous_settings,
      'after', jsonb_build_object(
        'sale_price', p_sale_price,
        'cost_price', p_cost_price,
        'reorder_point', p_reorder_point,
        'quantity', p_quantity_after,
        'is_active', p_is_active,
        'note', nullif(trim(coalesce(p_note, '')), '')
      ),
      'stock_delta', v_delta,
      'stock_adjustment_id', v_adjustment_id
    )
  );

  return jsonb_build_object(
    'product_id', p_product_id,
    'product_unit_id', p_product_unit_id,
    'branch_id', p_branch_id,
    'quantity_before', v_balance.on_hand,
    'quantity_after', p_quantity_after,
    'quantity_delta', v_delta,
    'stock_adjustment_id', v_adjustment_id
  );
end;
$$;

revoke all on function public.commerce_configure_branch_inventory_unit_item(
  uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.commerce_configure_branch_inventory_unit_item(
  uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, boolean, text, text
) to service_role;

-- The product remains active when at least one unit is sellable, but a unit
-- marked can_sell = false must be rejected by the sale transaction itself.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.commerce_finalize_pos_sale(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,text)'::regprocedure)
  into v_definition;

  if position('v_unit_can_sell' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      '  v_unit_cost numeric(14,2);',
      '  v_unit_cost numeric(14,2);' || chr(10) || '  v_unit_can_sell boolean;'
    );
    v_definition := replace(
      v_definition,
      'select p.name, p.default_sale_price, coalesce(bpus.cost_price, bis.cost_price, p.default_cost_price * pu.conversion_to_base), pu.name, pu.conversion_to_base',
      'select p.name, p.default_sale_price, coalesce(bpus.cost_price, bis.cost_price, p.default_cost_price * pu.conversion_to_base), pu.name, pu.conversion_to_base, pu.can_sell'
    );
    v_definition := replace(
      v_definition,
      'into v_product_name, v_default_price, v_unit_cost, v_unit_name, v_conversion',
      'into v_product_name, v_default_price, v_unit_cost, v_unit_name, v_conversion, v_unit_can_sell'
    );
    v_definition := replace(
      v_definition,
      '    if not found then' || chr(10) ||
      '      raise exception ''active product unit not found'' using errcode = ''22023'';' || chr(10) ||
      '    end if;',
      '    if not found then' || chr(10) ||
      '      raise exception ''active product unit not found'' using errcode = ''22023'';' || chr(10) ||
      '    end if;' || chr(10) || chr(10) ||
      '    if not v_unit_can_sell then' || chr(10) ||
      '      raise exception ''product unit is not available for sale'' using errcode = ''22023'';' || chr(10) ||
      '    end if;'
    );
    execute v_definition;
  end if;
end;
$$;
