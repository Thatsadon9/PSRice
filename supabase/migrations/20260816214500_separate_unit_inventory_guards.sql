-- Enforce sell/receive capabilities and mirror online reservations at unit level.

create or replace function private.commerce_sync_sale_unit_stock()
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
  select * into v_unit from public.product_units where id = new.product_unit_id and product_id = new.product_id and can_sell;
  if not found then raise exception 'product unit cannot be sold' using errcode = '22023'; end if;
  if v_mode <> 'separate_unit' then return new; end if;
  select branch_id, performed_by_user_id into v_branch_id, v_user_id from public.sales where id = new.sale_id;
  insert into public.stock_unit_balances(branch_id, product_id, product_unit_id)
  values (v_branch_id, new.product_id, new.product_unit_id)
  on conflict (branch_id, product_unit_id) do nothing;
  select * into v_balance from public.stock_unit_balances
  where branch_id = v_branch_id and product_unit_id = new.product_unit_id for update;
  if v_balance.on_hand - v_balance.reserved - v_balance.damaged < new.quantity then
    raise exception 'insufficient stock for product unit %', new.unit_name_snapshot using errcode = '22023';
  end if;
  v_after := round(v_balance.on_hand - new.quantity, 3);
  update public.stock_unit_balances set on_hand = v_after, updated_at = now()
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
  select * into v_balance from public.stock_unit_balances
  where branch_id = v_branch_id and product_unit_id = new.product_unit_id for update;
  v_after := round(v_balance.on_hand + new.quantity, 3);
  update public.stock_unit_balances set on_hand = v_after, updated_at = now()
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
  update public.stock_unit_balances set reserved = reserved + new.quantity, updated_at = now()
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
  if old.status = new.status or new.status not in ('cancelled', 'completed') then return new; end if;
  for v_item in select * from public.online_order_items where online_order_id = new.id loop
    select * into v_product from public.products where id = v_item.product_id;
    if not found or v_product.unit_inventory_mode <> 'separate_unit' then continue; end if;
    select * into v_unit from public.product_units where id = v_item.product_unit_id and product_id = v_item.product_id;
    if not found then raise exception 'online order product unit not found' using errcode = '22023'; end if;
    insert into public.stock_unit_balances(branch_id, product_id, product_unit_id)
    values (new.branch_id, v_item.product_id, v_item.product_unit_id)
    on conflict (branch_id, product_unit_id) do nothing;
    select * into v_balance from public.stock_unit_balances
    where branch_id = new.branch_id and product_unit_id = v_item.product_unit_id for update;
    if v_balance.reserved < v_item.quantity then raise exception 'online order unit reservation is inconsistent' using errcode = '22023'; end if;
    v_reserved_after := round(v_balance.reserved - v_item.quantity, 3);
    v_on_hand_after := v_balance.on_hand;
    if new.status = 'completed' then
      if v_balance.on_hand < v_item.quantity then raise exception 'stock is no longer available for product unit %', v_unit.name using errcode = '22023'; end if;
      v_on_hand_after := round(v_balance.on_hand - v_item.quantity, 3);
    end if;
    update public.stock_unit_balances set on_hand = v_on_hand_after, reserved = v_reserved_after, updated_at = now()
    where branch_id = new.branch_id and product_unit_id = v_item.product_unit_id;
    if new.status = 'completed' then
      insert into public.stock_unit_movements(
        branch_id, product_id, product_unit_id, movement_type,
        quantity_before, quantity_delta, quantity_after, base_quantity_delta,
        reference_type, reference_id
      ) values (
        new.branch_id, v_item.product_id, v_item.product_unit_id, 'sale',
        v_balance.on_hand, -v_item.quantity, v_on_hand_after, -v_item.base_quantity,
        'online_order', new.id
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
