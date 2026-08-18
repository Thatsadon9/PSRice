-- Return items must restore the physical unit that was originally sold.

create or replace function private.commerce_restore_sale_return_unit_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_return public.sale_returns%rowtype;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_balance public.stock_unit_balances%rowtype;
  v_after numeric(18,3);
begin
  select * into v_return from public.sale_returns where id = new.sale_return_id;
  select * into v_product from public.products where id = new.product_id;
  if not found or v_product.unit_inventory_mode <> 'separate_unit' then return new; end if;
  select * into v_unit from public.product_units where id = new.product_unit_id and product_id = new.product_id;
  if not found then raise exception 'returned sale product unit not found' using errcode = '22023'; end if;
  insert into public.stock_unit_balances(branch_id, product_id, product_unit_id)
  values (v_return.branch_id, new.product_id, new.product_unit_id)
  on conflict (branch_id, product_unit_id) do nothing;
  select * into v_balance from public.stock_unit_balances
  where branch_id = v_return.branch_id and product_unit_id = new.product_unit_id for update;
  v_after := round(v_balance.on_hand + new.quantity, 3);
  update public.stock_unit_balances set on_hand = v_after, updated_at = now()
  where branch_id = v_return.branch_id and product_unit_id = new.product_unit_id;
  insert into public.stock_unit_movements(
    branch_id, product_id, product_unit_id, movement_type,
    quantity_before, quantity_delta, quantity_after, base_quantity_delta,
    reference_type, reference_id, note, performed_by_user_id
  ) values (
    v_return.branch_id, new.product_id, new.product_unit_id, 'return',
    v_balance.on_hand, new.quantity, v_after, new.base_quantity,
    'sale_return', v_return.id, v_return.reason, v_return.performed_by_user_id
  );
  perform public.commerce_rebuild_product_stock(v_return.branch_id, new.product_id);
  return new;
end;
$$;

drop trigger if exists sale_return_items_restore_unit_stock on public.sale_return_items;
create trigger sale_return_items_restore_unit_stock
after insert on public.sale_return_items
for each row execute function private.commerce_restore_sale_return_unit_stock();
