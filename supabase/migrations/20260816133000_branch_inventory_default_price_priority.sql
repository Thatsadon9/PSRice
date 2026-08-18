-- The branch inventory price is the ordinary retail fallback for that branch.
-- Keep it below promotions, member/wholesale tiers, and explicit quantity prices.

update public.product_prices
set priority = -100,
    updated_at = now()
where is_inventory_default = true;

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
    'sale_price', coalesce(pp.price, p.default_sale_price),
    'cost_price', coalesce(bis.cost_price, p.default_cost_price),
    'reorder_point', coalesce(bis.reorder_point, p.reorder_point),
    'quantity', coalesce(sb.on_hand, 0),
    'is_active', coalesce(bpa.is_active, true),
    'note', bis.note
  ) into v_previous_settings
  from public.products p
  left join public.branch_inventory_settings bis
    on bis.branch_id = p_branch_id and bis.product_id = p.id
  left join public.branch_product_availability bpa
    on bpa.branch_id = p_branch_id and bpa.product_id = p.id
  left join public.stock_balances sb
    on sb.branch_id = p_branch_id and sb.product_id = p.id
  left join public.product_prices pp
    on pp.product_id = p.id
    and pp.product_unit_id = v_unit_id
    and pp.branch_id = p_branch_id
    and pp.customer_type = 'retail'
    and pp.is_inventory_default = true
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
    priority = -100,
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
      p_sale_price, -100, true, true
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
