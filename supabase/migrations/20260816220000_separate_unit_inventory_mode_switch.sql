-- Re-initialise physical unit balances when a product returns from shared stock.
-- This prevents stale unit balances from being reused after a mode switch.

create or replace function public.commerce_enable_product_unit_inventory(
  p_user_id uuid,
  p_product_id uuid,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_default_unit public.product_units%rowtype;
  v_branch record;
  v_balance public.stock_balances%rowtype;
  v_previous_mode text;
begin
  if p_mode not in ('shared_base', 'separate_unit') then
    raise exception 'invalid unit inventory mode' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.users
    where id = p_user_id
      and status = 'active'::public.user_status
      and role in ('admin'::public.user_role, 'manager'::public.user_role)
  ) then
    raise exception 'inventory mode access denied' using errcode = '42501';
  end if;
  select unit_inventory_mode into v_previous_mode from public.products where id = p_product_id for update;
  if not found then raise exception 'product not found' using errcode = 'P0002'; end if;
  select * into v_default_unit from public.product_units where product_id = p_product_id and is_default for update;
  if not found then raise exception 'default product unit not found' using errcode = '22023'; end if;

  if p_mode = 'separate_unit' and v_previous_mode <> 'separate_unit' then
    delete from public.stock_unit_balances where product_id = p_product_id;
  end if;
  update public.products set unit_inventory_mode = p_mode, updated_at = now() where id = p_product_id;

  if p_mode = 'separate_unit' then
    for v_branch in select id from public.branches where is_active loop
      select * into v_balance from public.stock_balances where branch_id = v_branch.id and product_id = p_product_id;
      insert into public.stock_unit_balances(
        branch_id, product_id, product_unit_id, on_hand, reserved, damaged, in_transit
      ) values (
        v_branch.id, p_product_id, v_default_unit.id,
        coalesce(v_balance.on_hand, 0) / v_default_unit.conversion_to_base,
        coalesce(v_balance.reserved, 0) / v_default_unit.conversion_to_base,
        coalesce(v_balance.damaged, 0) / v_default_unit.conversion_to_base,
        coalesce(v_balance.in_transit, 0) / v_default_unit.conversion_to_base
      )
      on conflict (branch_id, product_unit_id) do update set
        on_hand = excluded.on_hand,
        reserved = excluded.reserved,
        damaged = excluded.damaged,
        in_transit = excluded.in_transit,
        updated_at = now();
      perform public.commerce_rebuild_product_stock(v_branch.id, p_product_id);
    end loop;
  end if;
  return jsonb_build_object('product_id', p_product_id, 'unit_inventory_mode', p_mode);
end;
$$;

revoke all on function public.commerce_enable_product_unit_inventory(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.commerce_enable_product_unit_inventory(uuid, uuid, text) to service_role;
