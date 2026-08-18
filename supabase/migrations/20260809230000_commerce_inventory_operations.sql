create or replace function public.commerce_receive_stock(
  p_user_id uuid,
  p_branch_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_movement_type text default 'opening',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.user_role;
  v_actor_branch uuid;
  v_before numeric(18,3);
  v_after numeric(18,3);
  v_movement_id uuid;
begin
  if p_user_id is null or p_branch_id is null or p_product_id is null or p_quantity is null or p_quantity <= 0 then
    raise exception 'invalid inventory operation' using errcode = '22023';
  end if;

  if p_movement_type not in ('opening', 'receive', 'adjustment_in') then
    raise exception 'unsupported inventory movement type' using errcode = '22023';
  end if;

  select role, branch_id
  into v_actor_role, v_actor_branch
  from public.users
  where id = p_user_id and status = 'active'::public.user_status;

  if not found or v_actor_role = 'employee'::public.user_role then
    raise exception 'inventory access denied' using errcode = '42501';
  end if;

  if v_actor_role <> 'admin'::public.user_role and v_actor_branch is distinct from p_branch_id then
    raise exception 'branch access denied' using errcode = '42501';
  end if;

  if not exists (select 1 from public.products where id = p_product_id and is_active) then
    raise exception 'active product not found' using errcode = '22023';
  end if;

  insert into public.stock_balances(branch_id, product_id)
  values (p_branch_id, p_product_id)
  on conflict (branch_id, product_id) do nothing;

  select on_hand into v_before
  from public.stock_balances
  where branch_id = p_branch_id and product_id = p_product_id
  for update;

  v_after := v_before + round(p_quantity, 3);

  update public.stock_balances
  set on_hand = v_after, updated_at = now()
  where branch_id = p_branch_id and product_id = p_product_id;

  insert into public.stock_movements(
    branch_id, product_id, movement_type, quantity_before, quantity_delta, quantity_after,
    reference_type, performed_by_user_id, note
  ) values (
    p_branch_id, p_product_id, p_movement_type, v_before, round(p_quantity, 3), v_after,
    'inventory_receipt', p_user_id, nullif(trim(p_note), '')
  ) returning id into v_movement_id;

  insert into public.commerce_audit_logs(actor_user_id, branch_id, action, entity_type, entity_id, payload)
  values (
    p_user_id, p_branch_id, 'inventory.received', 'stock_movement', v_movement_id,
    jsonb_build_object('product_id', p_product_id, 'quantity', p_quantity, 'movement_type', p_movement_type)
  );

  return jsonb_build_object('movement_id', v_movement_id, 'on_hand', v_after);
end;
$$;

revoke all on function public.commerce_receive_stock(uuid, uuid, uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.commerce_receive_stock(uuid, uuid, uuid, numeric, text, text) to service_role;
