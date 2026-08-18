-- Keep the purchasing workflow intentionally small:
-- purchase order (no stock mutation) -> goods receipt (atomic stock mutation).

alter table public.branches
  add column if not exists is_active boolean not null default true;

alter table public.purchase_orders
  add column if not exists document_date date;

update public.purchase_orders
set document_date = ordered_at::date
where document_date is null;

alter table public.purchase_orders
  alter column document_date set default current_date,
  alter column document_date set not null;

create index if not exists purchase_orders_branch_document_date_idx
  on public.purchase_orders (branch_id, document_date desc, created_at desc);

create or replace function public.commerce_create_purchase_order(
  p_user_id uuid,
  p_branch_id uuid,
  p_supplier_id uuid,
  p_document_date date,
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
  v_document_date date := coalesce(p_document_date, current_date);
  v_item jsonb;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_quantity numeric(18,3);
  v_unit_cost numeric(14,2);
  v_line_total numeric(14,2);
  v_grand_total numeric(14,2) := 0;
  v_counter integer;
  v_order_id uuid;
  v_order_number text;
begin
  if p_user_id is null
    or p_branch_id is null
    or p_supplier_id is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid purchase order' using errcode = '22023';
  end if;

  select role, branch_id
  into v_actor_role, v_actor_branch
  from public.users
  where id = p_user_id and status = 'active'::public.user_status;

  if not found or v_actor_role = 'employee'::public.user_role then
    raise exception 'purchasing access denied' using errcode = '42501';
  end if;

  if v_actor_role <> 'admin'::public.user_role
    and v_actor_branch is distinct from p_branch_id then
    raise exception 'branch access denied' using errcode = '42501';
  end if;

  perform 1 from public.branches where id = p_branch_id and is_active = true;
  if not found then
    raise exception 'branch is not active' using errcode = '22023';
  end if;

  perform 1 from public.suppliers where id = p_supplier_id and is_active = true;
  if not found then
    raise exception 'supplier is not active' using errcode = '22023';
  end if;

  -- Validate every row and calculate the total before creating the document.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := round((v_item ->> 'quantity')::numeric, 3);
    v_unit_cost := round((v_item ->> 'unit_cost')::numeric, 2);
    if v_quantity <= 0 or v_unit_cost < 0 then
      raise exception 'invalid purchase order item' using errcode = '22023';
    end if;

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid and is_active = true;
    if not found then
      raise exception 'product is not active' using errcode = '22023';
    end if;

    select * into v_unit
    from public.product_units
    where id = (v_item ->> 'product_unit_id')::uuid
      and product_id = v_product.id;
    if not found then
      raise exception 'product unit is not active' using errcode = '22023';
    end if;

    v_grand_total := v_grand_total + round(v_quantity * v_unit_cost, 2);
  end loop;

  insert into public.commerce_document_counters(
    branch_id, document_date, document_type, last_value
  ) values (
    p_branch_id, v_document_date, 'purchase', 1
  )
  on conflict (branch_id, document_date, document_type)
  do update set last_value = public.commerce_document_counters.last_value + 1
  returning last_value into v_counter;

  v_order_number := format(
    'PO-%s-%s',
    to_char(v_document_date, 'YYMMDD'),
    lpad(v_counter::text, 4, '0')
  );

  insert into public.purchase_orders(
    purchase_order_number,
    branch_id,
    supplier_id,
    status,
    ordered_at,
    document_date,
    subtotal,
    grand_total,
    note,
    created_by_user_id,
    approved_by_user_id,
    approved_at
  ) values (
    v_order_number,
    p_branch_id,
    p_supplier_id,
    'approved',
    v_document_date::timestamptz,
    v_document_date,
    v_grand_total,
    v_grand_total,
    nullif(trim(p_note), ''),
    p_user_id,
    p_user_id,
    now()
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := round((v_item ->> 'quantity')::numeric, 3);
    v_unit_cost := round((v_item ->> 'unit_cost')::numeric, 2);
    v_line_total := round(v_quantity * v_unit_cost, 2);

    insert into public.purchase_order_items(
      purchase_order_id,
      product_id,
      product_unit_id,
      quantity_ordered,
      unit_cost,
      line_total
    ) values (
      v_order_id,
      (v_item ->> 'product_id')::uuid,
      (v_item ->> 'product_unit_id')::uuid,
      v_quantity,
      v_unit_cost,
      v_line_total
    );
  end loop;

  insert into public.commerce_audit_logs(
    actor_user_id, branch_id, action, entity_type, entity_id, payload
  ) values (
    p_user_id,
    p_branch_id,
    'purchase.created',
    'purchase_order',
    v_order_id,
    jsonb_build_object(
      'purchase_order_number', v_order_number,
      'supplier_id', p_supplier_id,
      'document_date', v_document_date,
      'grand_total', v_grand_total,
      'item_count', jsonb_array_length(p_items)
    )
  );

  return jsonb_build_object(
    'id', v_order_id,
    'purchase_order_number', v_order_number,
    'status', 'approved',
    'document_date', v_document_date,
    'grand_total', v_grand_total
  );
end;
$$;

revoke all on function public.commerce_create_purchase_order(uuid, uuid, uuid, date, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.commerce_create_purchase_order(uuid, uuid, uuid, date, jsonb, text)
  to service_role;
