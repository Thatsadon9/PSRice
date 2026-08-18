-- Keep unit-level balances aligned with the existing transfer and void-sale flows.

create or replace function private.commerce_sync_transfer_unit_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer public.stock_transfers%rowtype;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_source_balance public.stock_unit_balances%rowtype;
  v_destination_balance public.stock_unit_balances%rowtype;
  v_shipped_delta numeric(18,3);
  v_received_delta numeric(18,3);
  v_damaged_delta numeric(18,3);
  v_resolved_delta numeric(18,3);
  v_source_after numeric(18,3);
  v_destination_on_hand_after numeric(18,3);
  v_destination_damaged_after numeric(18,3);
  v_destination_in_transit_after numeric(18,3);
  v_user_id uuid;
begin
  if new.quantity_shipped < old.quantity_shipped
    or new.quantity_received < old.quantity_received
    or new.quantity_damaged < old.quantity_damaged then
    raise exception 'transfer quantities cannot be reduced after stock movement' using errcode = '22023';
  end if;

  v_shipped_delta := round(new.quantity_shipped - old.quantity_shipped, 3);
  v_received_delta := round(new.quantity_received - old.quantity_received, 3);
  v_damaged_delta := round(new.quantity_damaged - old.quantity_damaged, 3);
  v_resolved_delta := round(v_received_delta + v_damaged_delta, 3);

  if v_shipped_delta = 0 and v_resolved_delta = 0 then
    return new;
  end if;

  select * into v_transfer from public.stock_transfers where id = new.stock_transfer_id;
  if not found then
    raise exception 'stock transfer not found' using errcode = 'P0002';
  end if;
  select * into v_product from public.products where id = new.product_id;
  if not found or v_product.unit_inventory_mode <> 'separate_unit' then
    return new;
  end if;
  select * into v_unit from public.product_units where id = new.product_unit_id and product_id = new.product_id;
  if not found then
    raise exception 'transfer product unit not found' using errcode = '22023';
  end if;
  select coalesce(v_transfer.shipped_by_user_id, v_transfer.received_by_user_id) into v_user_id;

  if v_shipped_delta > 0 then
    insert into public.stock_unit_balances(branch_id, product_id, product_unit_id)
    values (v_transfer.source_branch_id, new.product_id, new.product_unit_id)
    on conflict (branch_id, product_unit_id) do nothing;
    select * into v_source_balance
    from public.stock_unit_balances
    where branch_id = v_transfer.source_branch_id and product_unit_id = new.product_unit_id
    for update;
    if v_source_balance.on_hand - v_source_balance.reserved - v_source_balance.damaged < v_shipped_delta then
      raise exception 'insufficient stock for product unit %', v_unit.name using errcode = '22023';
    end if;
    v_source_after := round(v_source_balance.on_hand - v_shipped_delta, 3);
    update public.stock_unit_balances
    set on_hand = v_source_after, updated_at = now()
    where branch_id = v_transfer.source_branch_id and product_unit_id = new.product_unit_id;
    insert into public.stock_unit_movements(
      branch_id, product_id, product_unit_id, movement_type,
      quantity_before, quantity_delta, quantity_after, base_quantity_delta,
      reference_type, reference_id, performed_by_user_id
    ) values (
      v_transfer.source_branch_id, new.product_id, new.product_unit_id, 'transfer_out',
      v_source_balance.on_hand, -v_shipped_delta, v_source_after,
      -round(v_shipped_delta * v_unit.conversion_to_base, 3),
      'stock_transfer', v_transfer.id, v_user_id
    );

    insert into public.stock_unit_balances(branch_id, product_id, product_unit_id, in_transit)
    values (v_transfer.destination_branch_id, new.product_id, new.product_unit_id, v_shipped_delta)
    on conflict (branch_id, product_unit_id) do update
    set in_transit = public.stock_unit_balances.in_transit + excluded.in_transit,
        updated_at = now();
  end if;

  if v_resolved_delta > 0 then
    insert into public.stock_unit_balances(branch_id, product_id, product_unit_id)
    values (v_transfer.destination_branch_id, new.product_id, new.product_unit_id)
    on conflict (branch_id, product_unit_id) do nothing;
    select * into v_destination_balance
    from public.stock_unit_balances
    where branch_id = v_transfer.destination_branch_id and product_unit_id = new.product_unit_id
    for update;
    if v_destination_balance.in_transit < v_resolved_delta then
      raise exception 'transfer unit is not in transit' using errcode = '22023';
    end if;
    v_destination_on_hand_after := round(v_destination_balance.on_hand + v_received_delta, 3);
    v_destination_damaged_after := round(v_destination_balance.damaged + v_damaged_delta, 3);
    v_destination_in_transit_after := round(v_destination_balance.in_transit - v_resolved_delta, 3);
    update public.stock_unit_balances
    set on_hand = v_destination_on_hand_after,
        damaged = v_destination_damaged_after,
        in_transit = v_destination_in_transit_after,
        updated_at = now()
    where branch_id = v_transfer.destination_branch_id and product_unit_id = new.product_unit_id;

    if v_received_delta > 0 then
      insert into public.stock_unit_movements(
        branch_id, product_id, product_unit_id, movement_type,
        quantity_before, quantity_delta, quantity_after, base_quantity_delta,
        reference_type, reference_id, performed_by_user_id
      ) values (
        v_transfer.destination_branch_id, new.product_id, new.product_unit_id, 'transfer_in',
        v_destination_balance.on_hand, v_received_delta, v_destination_on_hand_after,
        round(v_received_delta * v_unit.conversion_to_base, 3),
        'stock_transfer', v_transfer.id, v_user_id
      );
    end if;
    if v_damaged_delta > 0 then
      insert into public.stock_unit_movements(
        branch_id, product_id, product_unit_id, movement_type,
        quantity_before, quantity_delta, quantity_after, base_quantity_delta,
        reference_type, reference_id, performed_by_user_id
      ) values (
        v_transfer.destination_branch_id, new.product_id, new.product_unit_id, 'damage',
        v_destination_balance.damaged, v_damaged_delta, v_destination_damaged_after,
        round(v_damaged_delta * v_unit.conversion_to_base, 3),
        'stock_transfer', v_transfer.id, v_user_id
      );
    end if;
  end if;

  perform public.commerce_rebuild_product_stock(v_transfer.source_branch_id, new.product_id);
  perform public.commerce_rebuild_product_stock(v_transfer.destination_branch_id, new.product_id);
  return new;
end;
$$;

drop trigger if exists stock_transfer_items_sync_unit_stock on public.stock_transfer_items;
create trigger stock_transfer_items_sync_unit_stock
after update of quantity_shipped, quantity_received, quantity_damaged
on public.stock_transfer_items
for each row execute function private.commerce_sync_transfer_unit_stock();

create or replace function private.commerce_restore_voided_sale_unit_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.sale_items%rowtype;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_balance public.stock_unit_balances%rowtype;
  v_after numeric(18,3);
begin
  if old.status <> 'completed' or new.status <> 'voided' then
    return new;
  end if;

  for v_item in select * from public.sale_items where sale_id = new.id loop
    select * into v_product from public.products where id = v_item.product_id;
    if not found or v_product.unit_inventory_mode <> 'separate_unit' then
      continue;
    end if;
    select * into v_unit from public.product_units where id = v_item.product_unit_id and product_id = v_item.product_id;
    if not found then
      raise exception 'voided sale product unit not found' using errcode = '22023';
    end if;
    insert into public.stock_unit_balances(branch_id, product_id, product_unit_id)
    values (new.branch_id, v_item.product_id, v_item.product_unit_id)
    on conflict (branch_id, product_unit_id) do nothing;
    select * into v_balance
    from public.stock_unit_balances
    where branch_id = new.branch_id and product_unit_id = v_item.product_unit_id
    for update;
    v_after := round(v_balance.on_hand + v_item.quantity, 3);
    update public.stock_unit_balances
    set on_hand = v_after, updated_at = now()
    where branch_id = new.branch_id and product_unit_id = v_item.product_unit_id;
    insert into public.stock_unit_movements(
      branch_id, product_id, product_unit_id, movement_type,
      quantity_before, quantity_delta, quantity_after, base_quantity_delta,
      reference_type, reference_id, note, performed_by_user_id
    ) values (
      new.branch_id, v_item.product_id, v_item.product_unit_id, 'return',
      v_balance.on_hand, v_item.quantity, v_after,
      v_item.base_quantity, 'sale_void', new.id, new.void_reason, new.voided_by_user_id
    );
    perform public.commerce_rebuild_product_stock(new.branch_id, v_item.product_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists sales_restore_voided_unit_stock on public.sales;
create trigger sales_restore_voided_unit_stock
after update of status on public.sales
for each row execute function private.commerce_restore_voided_sale_unit_stock();

create or replace function private.commerce_sync_sale_unit_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_balance public.stock_unit_balances%rowtype;
  v_unit public.product_units%rowtype;
  v_after numeric(18,3);
  v_branch_id uuid;
  v_user_id uuid;
begin
  select unit_inventory_mode into v_mode from public.products where id = new.product_id;
  if v_mode <> 'separate_unit' then return new; end if;
  select * into v_unit from public.product_units where id = new.product_unit_id and product_id = new.product_id and can_sell;
  if not found then raise exception 'product unit cannot be sold' using errcode = '22023'; end if;
  select branch_id, performed_by_user_id into v_branch_id, v_user_id from public.sales where id = new.sale_id;
  insert into public.stock_unit_balances(branch_id, product_id, product_unit_id)
  values (v_branch_id, new.product_id, new.product_unit_id)
  on conflict (branch_id, product_unit_id) do nothing;
  select * into v_balance
  from public.stock_unit_balances
  where branch_id = v_branch_id and product_unit_id = new.product_unit_id
  for update;
  if v_balance.on_hand - v_balance.reserved - v_balance.damaged < new.quantity then
    raise exception 'insufficient stock for product unit %', new.unit_name_snapshot using errcode = '22023';
  end if;
  v_after := round(v_balance.on_hand - new.quantity, 3);
  update public.stock_unit_balances
  set on_hand = v_after, updated_at = now()
  where branch_id = v_branch_id and product_unit_id = new.product_unit_id;
  insert into public.stock_unit_movements(
    branch_id, product_id, product_unit_id, movement_type,
    quantity_before, quantity_delta, quantity_after, base_quantity_delta,
    reference_type, reference_id, performed_by_user_id
  ) values (
    v_branch_id, new.product_id, new.product_unit_id, 'sale',
    v_balance.on_hand, -new.quantity, v_after, -new.base_quantity,
    'sale', new.sale_id, v_user_id
  );
  return new;
end;
$$;

drop trigger if exists sale_items_sync_unit_stock on public.sale_items;
create trigger sale_items_sync_unit_stock
after insert on public.sale_items
for each row execute function private.commerce_sync_sale_unit_stock();

create or replace function private.commerce_sync_receipt_unit_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_unit public.product_units%rowtype;
  v_balance public.stock_unit_balances%rowtype;
  v_after numeric(18,3);
  v_branch_id uuid;
  v_user_id uuid;
begin
  select unit_inventory_mode into v_mode from public.products where id = new.product_id;
  select * into v_unit from public.product_units where id = new.product_unit_id and product_id = new.product_id and can_receive;
  if not found then raise exception 'product unit cannot be received' using errcode = '22023'; end if;
  if v_mode <> 'separate_unit' then return new; end if;
  select gr.branch_id, gr.received_by_user_id into v_branch_id, v_user_id
  from public.goods_receipts gr where gr.id = new.goods_receipt_id;
  insert into public.stock_unit_balances(branch_id, product_id, product_unit_id)
  values (v_branch_id, new.product_id, new.product_unit_id)
  on conflict (branch_id, product_unit_id) do nothing;
  select * into v_balance
  from public.stock_unit_balances
  where branch_id = v_branch_id and product_unit_id = new.product_unit_id
  for update;
  v_after := round(v_balance.on_hand + new.quantity, 3);
  update public.stock_unit_balances
  set on_hand = v_after, updated_at = now()
  where branch_id = v_branch_id and product_unit_id = new.product_unit_id;
  insert into public.stock_unit_movements(
    branch_id, product_id, product_unit_id, movement_type,
    quantity_before, quantity_delta, quantity_after, base_quantity_delta,
    reference_type, reference_id, performed_by_user_id
  ) values (
    v_branch_id, new.product_id, new.product_unit_id, 'receive',
    v_balance.on_hand, new.quantity, v_after, new.base_quantity,
    'goods_receipt', new.goods_receipt_id, v_user_id
  );
  perform public.commerce_rebuild_product_stock(v_branch_id, new.product_id);
  return new;
end;
$$;

drop trigger if exists goods_receipt_items_sync_unit_stock on public.goods_receipt_items;
create trigger goods_receipt_items_sync_unit_stock
after insert on public.goods_receipt_items
for each row execute function private.commerce_sync_receipt_unit_stock();

create or replace function private.commerce_reserve_online_order_unit_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.online_orders%rowtype;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
begin
  select * into v_order from public.online_orders where id = new.online_order_id;
  select * into v_product from public.products where id = new.product_id;
  select * into v_unit from public.product_units where id = new.product_unit_id and product_id = new.product_id and can_sell;
  if not found then raise exception 'product unit cannot be sold online' using errcode = '22023'; end if;
  if v_product.unit_inventory_mode <> 'separate_unit' then return new; end if;
  insert into public.stock_unit_balances(branch_id, product_id, product_unit_id)
  values (v_order.branch_id, new.product_id, new.product_unit_id)
  on conflict (branch_id, product_unit_id) do nothing;
  update public.stock_unit_balances
  set reserved = reserved + new.quantity, updated_at = now()
  where branch_id = v_order.branch_id and product_unit_id = new.product_unit_id;
  perform public.commerce_rebuild_product_stock(v_order.branch_id, new.product_id);
  return new;
end;
$$;

drop trigger if exists online_order_items_reserve_unit_stock on public.online_order_items;
create trigger online_order_items_reserve_unit_stock
after insert on public.online_order_items
for each row execute function private.commerce_reserve_online_order_unit_stock();

create or replace function private.commerce_finalize_online_order_unit_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.online_order_items%rowtype;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_balance public.stock_unit_balances%rowtype;
  v_on_hand_after numeric(18,3);
  v_reserved_after numeric(18,3);
begin
  if old.status = new.status or new.status not in ('cancelled', 'completed') then
    return new;
  end if;
  for v_item in select * from public.online_order_items where online_order_id = new.id loop
    select * into v_product from public.products where id = v_item.product_id;
    if not found or v_product.unit_inventory_mode <> 'separate_unit' then continue; end if;
    select * into v_unit from public.product_units where id = v_item.product_unit_id and product_id = v_item.product_id;
    if not found then raise exception 'online order product unit not found' using errcode = '22023'; end if;
    insert into public.stock_unit_balances(branch_id, product_id, product_unit_id)
    values (new.branch_id, v_item.product_id, v_item.product_unit_id)
    on conflict (branch_id, product_unit_id) do nothing;
    select * into v_balance
    from public.stock_unit_balances
    where branch_id = new.branch_id and product_unit_id = v_item.product_unit_id
    for update;
    if v_balance.reserved < v_item.quantity then
      raise exception 'online order unit reservation is inconsistent' using errcode = '22023';
    end if;
    v_reserved_after := round(v_balance.reserved - v_item.quantity, 3);
    v_on_hand_after := v_balance.on_hand;
    if new.status = 'completed' then
      if v_balance.on_hand < v_item.quantity then
        raise exception 'stock is no longer available for product unit %', v_unit.name using errcode = '22023';
      end if;
      v_on_hand_after := round(v_balance.on_hand - v_item.quantity, 3);
    end if;
    update public.stock_unit_balances
    set on_hand = v_on_hand_after, reserved = v_reserved_after, updated_at = now()
    where branch_id = new.branch_id and product_unit_id = v_item.product_unit_id;
    if new.status = 'completed' then
      insert into public.stock_unit_movements(
        branch_id, product_id, product_unit_id, movement_type,
        quantity_before, quantity_delta, quantity_after, base_quantity_delta,
        reference_type, reference_id, performed_by_user_id
      ) values (
        new.branch_id, v_item.product_id, v_item.product_unit_id, 'sale',
        v_balance.on_hand, -v_item.quantity, v_on_hand_after, -v_item.base_quantity,
        'online_order', new.id, null
      );
    end if;
    perform public.commerce_rebuild_product_stock(new.branch_id, v_item.product_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists online_orders_finalize_unit_stock on public.online_orders;
create trigger online_orders_finalize_unit_stock
after update of status on public.online_orders
for each row execute function private.commerce_finalize_online_order_unit_stock();
