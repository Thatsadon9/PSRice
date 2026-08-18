-- Branch-level inventory configuration used by the stock management workspace.
-- Products remain global, while operating values can be overridden per branch.

create table if not exists public.branch_inventory_settings (
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  cost_price numeric(14,2) check (cost_price is null or cost_price >= 0),
  reorder_point numeric(18,3) check (reorder_point is null or reorder_point >= 0),
  note text,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (branch_id, product_id)
);

comment on table public.branch_inventory_settings is
  'Per-branch operating overrides for cost, reorder point, and inventory notes.';

create index if not exists branch_inventory_settings_product_idx
  on public.branch_inventory_settings(product_id);

drop trigger if exists branch_inventory_settings_set_updated_at on public.branch_inventory_settings;
create trigger branch_inventory_settings_set_updated_at
before update on public.branch_inventory_settings
for each row execute function public.set_updated_at_timestamp();

alter table public.branch_inventory_settings enable row level security;
revoke all on public.branch_inventory_settings from anon, authenticated;
grant all on public.branch_inventory_settings to service_role;
drop policy if exists commerce_server_only on public.branch_inventory_settings;
create policy commerce_server_only on public.branch_inventory_settings
  for all to authenticated using (false) with check (false);

-- Mark one ordinary retail price as the branch default. Promotions and quantity
-- prices continue to use the existing priority-based price resolver.
alter table public.product_prices
  add column if not exists is_inventory_default boolean not null default false;

create unique index if not exists product_prices_one_inventory_default_idx
  on public.product_prices(product_id, product_unit_id, branch_id)
  where is_inventory_default = true and branch_id is not null and customer_type = 'retail';

create or replace function public.commerce_configure_branch_inventory_item(
  p_user_id uuid,
  p_branch_id uuid,
  p_product_id uuid,
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
  v_unit_id uuid;
  v_before numeric(18,3);
  v_reserved numeric(18,3);
  v_damaged numeric(18,3);
  v_delta numeric(18,3);
  v_adjustment_id uuid;
  v_previous_settings jsonb;
begin
  if p_user_id is null or p_branch_id is null or p_product_id is null
    or p_sale_price is null or p_sale_price < 0
    or p_cost_price is null or p_cost_price < 0
    or p_reorder_point is null or p_reorder_point < 0
    or p_quantity_after is null or p_quantity_after < 0
    or p_is_active is null then
    raise exception 'invalid branch inventory configuration' using errcode = '22023';
  end if;

  if not public.commerce_has_permission(p_user_id, 'inventory.adjust', p_branch_id)
    or not public.commerce_has_permission(p_user_id, 'pricing.manage', p_branch_id) then
    raise exception 'branch inventory configuration access denied' using errcode = '42501';
  end if;

  select pu.id into v_unit_id
  from public.product_units pu
  where pu.product_id = p_product_id
  order by pu.is_default desc, pu.created_at asc
  limit 1;

  if v_unit_id is null then
    raise exception 'product default unit not found' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'cost_price', coalesce(bis.cost_price, p.default_cost_price),
    'reorder_point', coalesce(bis.reorder_point, p.reorder_point),
    'is_active', coalesce(bpa.is_active, true),
    'note', bis.note
  ) into v_previous_settings
  from public.products p
  left join public.branch_inventory_settings bis
    on bis.branch_id = p_branch_id and bis.product_id = p.id
  left join public.branch_product_availability bpa
    on bpa.branch_id = p_branch_id and bpa.product_id = p.id
  where p.id = p_product_id;

  if v_previous_settings is null then
    raise exception 'product not found' using errcode = '22023';
  end if;

  insert into public.branch_inventory_settings(
    branch_id, product_id, cost_price, reorder_point, note, updated_by_user_id
  ) values (
    p_branch_id, p_product_id, p_cost_price, p_reorder_point,
    nullif(trim(coalesce(p_note, '')), ''), p_user_id
  )
  on conflict (branch_id, product_id) do update set
    cost_price = excluded.cost_price,
    reorder_point = excluded.reorder_point,
    note = excluded.note,
    updated_by_user_id = excluded.updated_by_user_id,
    updated_at = now();

  insert into public.branch_product_availability(
    branch_id, product_id, is_active, updated_by_user_id
  ) values (p_branch_id, p_product_id, p_is_active, p_user_id)
  on conflict (branch_id, product_id) do update set
    is_active = excluded.is_active,
    updated_by_user_id = excluded.updated_by_user_id,
    updated_at = now();

  update public.product_prices set
    price = p_sale_price,
    priority = 100,
    minimum_quantity = 0,
    starts_at = null,
    ends_at = null,
    is_active = true,
    updated_at = now()
  where product_id = p_product_id
    and product_unit_id = v_unit_id
    and branch_id = p_branch_id
    and customer_type = 'retail'
    and is_inventory_default = true;

  if not found then
    insert into public.product_prices(
      product_id, product_unit_id, branch_id, customer_type, minimum_quantity,
      price, priority, is_active, is_inventory_default
    ) values (
      p_product_id, v_unit_id, p_branch_id, 'retail', 0,
      p_sale_price, 100, true, true
    );
  end if;

  insert into public.stock_balances(branch_id, product_id, on_hand, reserved, damaged, in_transit)
  values (p_branch_id, p_product_id, 0, 0, 0, 0)
  on conflict (branch_id, product_id) do nothing;

  select on_hand, reserved, damaged into v_before, v_reserved, v_damaged
  from public.stock_balances
  where branch_id = p_branch_id and product_id = p_product_id
  for update;

  if p_quantity_after < v_reserved + v_damaged then
    raise exception 'counted quantity cannot be lower than reserved and damaged stock' using errcode = '22023';
  end if;

  v_delta := p_quantity_after - v_before;
  if v_delta <> 0 then
    if coalesce(trim(p_stock_reason), '') = '' then
      raise exception 'stock adjustment reason is required' using errcode = '22023';
    end if;

    update public.stock_balances
    set on_hand = p_quantity_after, updated_at = now()
    where branch_id = p_branch_id and product_id = p_product_id;

    insert into public.stock_adjustments(
      branch_id, product_id, quantity_before, quantity_after, quantity_delta,
      reason, note, performed_by_user_id
    ) values (
      p_branch_id, p_product_id, v_before, p_quantity_after, v_delta,
      trim(p_stock_reason), nullif(trim(coalesce(p_note, '')), ''), p_user_id
    ) returning id into v_adjustment_id;

    insert into public.stock_movements(
      branch_id, product_id, movement_type, quantity_before, quantity_delta,
      quantity_after, reference_type, reference_id, note, performed_by_user_id
    ) values (
      p_branch_id, p_product_id,
      case when v_delta > 0 then 'adjustment_in' else 'adjustment_out' end,
      v_before, v_delta, p_quantity_after, 'stock_adjustment', v_adjustment_id,
      nullif(trim(coalesce(p_note, '')), ''), p_user_id
    );
  end if;

  insert into public.commerce_audit_logs(
    actor_user_id, branch_id, action, entity_type, entity_id, payload
  ) values (
    p_user_id, p_branch_id, 'inventory.branch_item.configured', 'product', p_product_id,
    jsonb_build_object(
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
    'branch_id', p_branch_id,
    'quantity_before', v_before,
    'quantity_after', p_quantity_after,
    'quantity_delta', v_delta,
    'stock_adjustment_id', v_adjustment_id
  );
end;
$$;

revoke all on function public.commerce_configure_branch_inventory_item(
  uuid, uuid, uuid, numeric, numeric, numeric, numeric, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.commerce_configure_branch_inventory_item(
  uuid, uuid, uuid, numeric, numeric, numeric, numeric, boolean, text, text
) to service_role;

-- Snapshot the branch cost on POS sales. Branch sale prices already flow through
-- product_prices and therefore use the existing price-priority resolver.
do $$
declare
  v_definition text;
  v_select_before text := 'select p.name, p.default_sale_price, p.default_cost_price, pu.name, pu.conversion_to_base';
  v_select_after text := 'select p.name, p.default_sale_price, coalesce(bis.cost_price, p.default_cost_price), pu.name, pu.conversion_to_base';
  v_join_before text := 'join public.product_units pu on pu.id = v_product_unit_id and pu.product_id = p.id';
  v_join_after text := 'join public.product_units pu on pu.id = v_product_unit_id and pu.product_id = p.id' || chr(10) ||
    '    left join public.branch_inventory_settings bis on bis.branch_id = p_branch_id and bis.product_id = p.id';
begin
  select pg_get_functiondef('public.commerce_finalize_pos_sale(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,text)'::regprocedure)
  into v_definition;

  if position('branch_inventory_settings bis' in v_definition) = 0 then
    if position(v_select_before in v_definition) = 0 or position(v_join_before in v_definition) = 0 then
      raise exception 'Could not apply branch inventory cost to commerce_finalize_pos_sale';
    end if;
    v_definition := replace(v_definition, v_select_before, v_select_after);
    v_definition := replace(v_definition, v_join_before, v_join_after);
    execute v_definition;
  end if;
end $$;

revoke all on function public.commerce_finalize_pos_sale(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,text)
  from public, anon, authenticated;
grant execute on function public.commerce_finalize_pos_sale(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,text)
  to service_role;
