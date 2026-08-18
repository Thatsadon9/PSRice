create or replace function public.commerce_update_online_order_status(
  p_user_id uuid,
  p_branch_id uuid,
  p_order_id uuid,
  p_next_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.online_orders%rowtype;
  v_actor public.users%rowtype;
  v_item public.online_order_items%rowtype;
  v_allowed boolean := false;
begin
  if p_user_id is null or p_branch_id is null or p_order_id is null or p_next_status not in ('paid', 'packing', 'ready_for_pickup', 'shipping', 'completed', 'cancelled') then
    raise exception 'invalid online order status request' using errcode = '22023';
  end if;
  select * into v_actor from public.users where id = p_user_id and status = 'active';
  if not found or (v_actor.role <> 'admin' and v_actor.role <> 'manager') or (v_actor.role <> 'admin' and v_actor.branch_id <> p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_order from public.online_orders where id = p_order_id and branch_id = p_branch_id for update;
  if not found then raise exception 'online order not found' using errcode = '22023'; end if;

  v_allowed := (v_order.status = 'awaiting_payment' and p_next_status in ('paid', 'cancelled'))
    or (v_order.status = 'paid' and p_next_status in ('packing', 'cancelled'))
    or (v_order.status = 'packing' and p_next_status in ('ready_for_pickup', 'shipping', 'cancelled'))
    or (v_order.status = 'ready_for_pickup' and p_next_status in ('completed', 'cancelled'))
    or (v_order.status = 'shipping' and p_next_status in ('completed', 'cancelled'));
  if not v_allowed then raise exception 'invalid status transition' using errcode = '22023'; end if;

  if p_next_status = 'cancelled' then
    for v_item in select * from public.online_order_items where online_order_id = v_order.id loop
      update public.stock_balances set reserved = greatest(0, reserved - v_item.base_quantity), updated_at = now()
      where branch_id = v_order.branch_id and product_id = v_item.product_id;
    end loop;
  elsif p_next_status = 'completed' then
    for v_item in select * from public.online_order_items where online_order_id = v_order.id loop
      update public.stock_balances set on_hand = on_hand - v_item.base_quantity, reserved = greatest(0, reserved - v_item.base_quantity), updated_at = now()
      where branch_id = v_order.branch_id and product_id = v_item.product_id and on_hand >= v_item.base_quantity;
      if not found then raise exception 'stock is no longer available' using errcode = '22023'; end if;
      insert into public.stock_movements(branch_id, product_id, movement_type, quantity_before, quantity_delta, quantity_after, reference_type, reference_id, performed_by_user_id, note)
      select v_order.branch_id, v_item.product_id, 'sale', on_hand + v_item.base_quantity, -v_item.base_quantity, on_hand, 'online_order', v_order.id, p_user_id, v_order.order_number
      from public.stock_balances where branch_id = v_order.branch_id and product_id = v_item.product_id;
    end loop;
  end if;

  update public.online_orders set status = p_next_status, paid_at = case when p_next_status = 'paid' then now() else paid_at end where id = v_order.id;
  insert into public.commerce_audit_logs(actor_user_id, branch_id, action, entity_type, entity_id, payload)
  values (p_user_id, p_branch_id, 'online_order.status_changed', 'online_order', v_order.id, jsonb_build_object('from', v_order.status, 'to', p_next_status));
  return jsonb_build_object('order_id', v_order.id, 'status', p_next_status);
end;
$$;

revoke all on function public.commerce_update_online_order_status(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.commerce_update_online_order_status(uuid, uuid, uuid, text) to service_role;
