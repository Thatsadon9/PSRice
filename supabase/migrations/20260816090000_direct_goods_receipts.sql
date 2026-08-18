-- Allow goods receipts that are recorded directly, without a purchase order.
alter table public.goods_receipts
  alter column purchase_order_id drop not null;

alter table public.goods_receipt_items
  alter column purchase_order_item_id drop not null;

alter table public.goods_receipts
  add column if not exists payment_method text,
  add constraint goods_receipts_payment_method_check
    check (payment_method is null or payment_method in ('cash', 'transfer', 'credit', 'other'));

create or replace function public.commerce_receive_goods_direct(
  p_user_id uuid,
  p_branch_id uuid,
  p_supplier_id uuid,
  p_received_at timestamptz,
  p_payment_method text,
  p_items jsonb,
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
  v_received_at timestamptz := coalesce(p_received_at, now());
  v_item jsonb;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_quantity numeric(18,3);
  v_base_quantity numeric(18,3);
  v_unit_cost numeric(14,2);
  v_receipt_id uuid;
  v_receipt_number text;
  v_counter integer;
  v_before numeric(18,3);
  v_after numeric(18,3);
begin
  if p_user_id is null or p_branch_id is null or p_supplier_id is null
    or p_payment_method not in ('cash', 'transfer', 'credit', 'other')
    or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid direct goods receipt' using errcode = '22023';
  end if;

  select role, branch_id into v_actor_role, v_actor_branch
  from public.users where id = p_user_id and status = 'active'::public.user_status;
  if not found or v_actor_role = 'employee'::public.user_role then raise exception 'purchasing access denied' using errcode = '42501'; end if;
  if v_actor_role <> 'admin'::public.user_role and v_actor_branch is distinct from p_branch_id then raise exception 'branch access denied' using errcode = '42501'; end if;

  perform 1 from public.branches where id = p_branch_id and is_active = true;
  if not found then raise exception 'branch is not active' using errcode = '22023'; end if;
  perform 1 from public.suppliers where id = p_supplier_id and is_active = true;
  if not found then raise exception 'supplier is not active' using errcode = '22023'; end if;

  insert into public.commerce_document_counters(branch_id, document_date, document_type, last_value)
  values (p_branch_id, v_received_at::date, 'goods_receipt', 1)
  on conflict (branch_id, document_date, document_type)
  do update set last_value = public.commerce_document_counters.last_value + 1
  returning last_value into v_counter;
  v_receipt_number := format('GR-%s-%s', to_char(v_received_at, 'YYMMDD'), lpad(v_counter::text, 4, '0'));

  insert into public.goods_receipts(goods_receipt_number, branch_id, supplier_id, received_by_user_id, received_at, payment_method, note)
  values (v_receipt_number, p_branch_id, p_supplier_id, p_user_id, v_received_at, p_payment_method, nullif(trim(p_note), ''))
  returning id into v_receipt_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := round((v_item ->> 'quantity')::numeric, 3);
    v_unit_cost := round((v_item ->> 'unit_cost')::numeric, 2);
    if v_quantity <= 0 or v_unit_cost < 0 then raise exception 'invalid goods receipt item' using errcode = '22023'; end if;
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid and is_active = true;
    if not found then raise exception 'product is not active' using errcode = '22023'; end if;
    select * into v_unit from public.product_units where id = (v_item ->> 'product_unit_id')::uuid and product_id = v_product.id;
    if not found then raise exception 'product unit is not active' using errcode = '22023'; end if;

    v_base_quantity := round(v_quantity * v_unit.conversion_to_base, 3);
    insert into public.goods_receipt_items(goods_receipt_id, product_id, product_unit_id, quantity, base_quantity, unit_cost)
    values (v_receipt_id, v_product.id, v_unit.id, v_quantity, v_base_quantity, v_unit_cost);
    insert into public.stock_balances(branch_id, product_id) values (p_branch_id, v_product.id) on conflict (branch_id, product_id) do nothing;
    select on_hand into v_before from public.stock_balances where branch_id = p_branch_id and product_id = v_product.id for update;
    v_after := v_before + v_base_quantity;
    update public.stock_balances set on_hand = v_after, updated_at = now() where branch_id = p_branch_id and product_id = v_product.id;
    update public.products set default_cost_price = v_unit_cost, updated_at = now() where id = v_product.id;
    insert into public.stock_movements(branch_id, product_id, movement_type, quantity_before, quantity_delta, quantity_after, reference_type, reference_id, performed_by_user_id, note)
    values (p_branch_id, v_product.id, 'receive', v_before, v_base_quantity, v_after, 'goods_receipt', v_receipt_id, p_user_id, nullif(trim(p_note), ''));
  end loop;

  insert into public.commerce_audit_logs(actor_user_id, branch_id, action, entity_type, entity_id, payload)
  values (p_user_id, p_branch_id, 'goods_receipt.direct_created', 'goods_receipt', v_receipt_id,
    jsonb_build_object('goods_receipt_number', v_receipt_number, 'supplier_id', p_supplier_id, 'payment_method', p_payment_method));
  return jsonb_build_object('goods_receipt_id', v_receipt_id, 'goods_receipt_number', v_receipt_number);
end;
$$;

revoke all on function public.commerce_receive_goods_direct(uuid, uuid, uuid, timestamptz, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.commerce_receive_goods_direct(uuid, uuid, uuid, timestamptz, text, jsonb, text) to service_role;
