-- Make stock counts unit-aware for products that keep separate physical stock.

alter table public.stock_count_items
  add column if not exists product_unit_id uuid references public.product_units(id) on delete restrict;

alter table public.stock_count_items
  drop constraint if exists stock_count_items_stock_count_session_id_product_id_key;

create unique index if not exists stock_count_items_session_product_unit_idx
  on public.stock_count_items(stock_count_session_id, product_id, product_unit_id)
  where product_unit_id is not null;

create unique index if not exists stock_count_items_session_product_shared_idx
  on public.stock_count_items(stock_count_session_id, product_id)
  where product_unit_id is null;

create or replace function public.commerce_post_stock_count(p_user_id uuid, p_stock_count_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.stock_count_sessions%rowtype;
  v_item public.stock_count_items%rowtype;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_balance public.stock_balances%rowtype;
  v_unit_balance public.stock_unit_balances%rowtype;
  v_posted integer := 0;
  v_unit_after numeric(18,3);
begin
  select * into v_session from public.stock_count_sessions where id = p_stock_count_session_id for update;
  if not found or v_session.status <> 'approved' then raise exception 'stock count must be approved before posting' using errcode = '22023'; end if;
  if not public.commerce_has_permission(p_user_id, 'inventory.approve_count', v_session.branch_id) then raise exception 'stock count post access denied' using errcode = '42501'; end if;
  for v_item in select * from public.stock_count_items where stock_count_session_id = v_session.id for update loop
    if v_item.counted_quantity is null then raise exception 'all stock count items must be counted' using errcode = '22023'; end if;
    select * into v_product from public.products where id = v_item.product_id for update;
    if not found then raise exception 'stock count product not found' using errcode = 'P0002'; end if;

    if v_product.unit_inventory_mode = 'separate_unit' then
      if v_item.product_unit_id is null then raise exception 'separate unit stock count is missing a unit' using errcode = '22023'; end if;
      select * into v_unit from public.product_units where id = v_item.product_unit_id and product_id = v_item.product_id;
      if not found then raise exception 'stock count product unit not found' using errcode = '22023'; end if;
      insert into public.stock_unit_balances(branch_id, product_id, product_unit_id)
      values (v_session.branch_id, v_item.product_id, v_item.product_unit_id)
      on conflict (branch_id, product_unit_id) do nothing;
      select * into v_unit_balance from public.stock_unit_balances
      where branch_id = v_session.branch_id and product_unit_id = v_item.product_unit_id for update;
      if v_item.counted_quantity < v_unit_balance.reserved + v_unit_balance.damaged then
        raise exception 'counted unit stock is lower than reserved or damaged stock' using errcode = '22023';
      end if;
      if v_item.counted_quantity <> v_unit_balance.on_hand then
        v_unit_after := v_item.counted_quantity;
        update public.stock_unit_balances set on_hand = v_unit_after, updated_at = now()
        where branch_id = v_session.branch_id and product_unit_id = v_item.product_unit_id;
        insert into public.stock_unit_movements(
          branch_id, product_id, product_unit_id, movement_type,
          quantity_before, quantity_delta, quantity_after, base_quantity_delta,
          reference_type, reference_id, note, performed_by_user_id
        ) values (
          v_session.branch_id, v_item.product_id, v_item.product_unit_id,
          case when v_unit_after > v_unit_balance.on_hand then 'adjustment_in' else 'adjustment_out' end,
          v_unit_balance.on_hand, v_unit_after - v_unit_balance.on_hand, v_unit_after,
          round((v_unit_after - v_unit_balance.on_hand) * v_unit.conversion_to_base, 3),
          'stock_count', v_session.id, v_item.reason, p_user_id
        );
        perform public.commerce_rebuild_product_stock(v_session.branch_id, v_item.product_id);
        v_posted := v_posted + 1;
      end if;
    else
      insert into public.stock_balances(branch_id, product_id)
      values (v_session.branch_id, v_item.product_id)
      on conflict (branch_id, product_id) do nothing;
      select * into v_balance from public.stock_balances
      where branch_id = v_session.branch_id and product_id = v_item.product_id for update;
      if v_item.counted_quantity < v_balance.reserved + v_balance.damaged then raise exception 'counted stock is lower than reserved or damaged stock' using errcode = '22023'; end if;
      if v_item.counted_quantity <> v_balance.on_hand then
        update public.stock_balances set on_hand = v_item.counted_quantity, updated_at = now()
        where branch_id = v_session.branch_id and product_id = v_item.product_id;
        insert into public.stock_movements(branch_id, product_id, movement_type, quantity_before, quantity_delta, quantity_after, reference_type, reference_id, note, performed_by_user_id)
        values (v_session.branch_id, v_item.product_id, case when v_item.counted_quantity > v_balance.on_hand then 'adjustment_in' else 'adjustment_out' end, v_balance.on_hand, v_item.counted_quantity - v_balance.on_hand, v_item.counted_quantity, 'stock_count', v_session.id, v_item.reason, p_user_id);
        v_posted := v_posted + 1;
      end if;
    end if;
  end loop;
  update public.stock_count_sessions set status = 'posted', posted_at = now(), updated_at = now() where id = v_session.id;
  insert into public.commerce_audit_logs(actor_user_id, branch_id, action, entity_type, entity_id, payload)
  values (p_user_id, v_session.branch_id, 'stock_count.posted', 'stock_count_session', v_session.id, jsonb_build_object('adjusted_items', v_posted));
  return jsonb_build_object('stock_count_session_id', v_session.id, 'adjusted_items', v_posted);
end;
$$;

revoke all on function public.commerce_post_stock_count(uuid, uuid) from public, anon, authenticated;
grant execute on function public.commerce_post_stock_count(uuid, uuid) to service_role;
