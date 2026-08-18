-- Online storefront orders share the Commerce product and stock ledger.

alter table public.commerce_document_counters
  drop constraint if exists commerce_document_counters_document_type_check;
alter table public.commerce_document_counters
  add constraint commerce_document_counters_document_type_check
  check (document_type in ('sale', 'return', 'purchase', 'transfer', 'online_order'));

create table if not exists public.online_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  fulfillment_method text not null default 'pickup' check (fulfillment_method in ('pickup', 'delivery')),
  delivery_address text,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'paid', 'packing', 'ready_for_pickup', 'shipping', 'completed', 'cancelled')),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(14,2) not null default 0 check (discount_total >= 0),
  delivery_fee numeric(14,2) not null default 0 check (delivery_fee >= 0),
  grand_total numeric(14,2) not null default 0 check (grand_total >= 0),
  payment_method text not null default 'bank_transfer' check (payment_method in ('bank_transfer', 'qr', 'cash_on_pickup')),
  note text,
  placed_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  check ((fulfillment_method = 'delivery' and delivery_address is not null) or fulfillment_method = 'pickup')
);

create table if not exists public.online_order_items (
  id uuid primary key default gen_random_uuid(),
  online_order_id uuid not null references public.online_orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_unit_id uuid not null references public.product_units(id) on delete restrict,
  product_name_snapshot text not null,
  unit_name_snapshot text not null,
  quantity numeric(18,3) not null check (quantity > 0),
  base_quantity numeric(18,3) not null check (base_quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  check (discount_amount <= quantity * unit_price)
);

create index if not exists online_orders_branch_status_placed_idx on public.online_orders(branch_id, status, placed_at desc);
create index if not exists online_orders_customer_phone_idx on public.online_orders(customer_phone, placed_at desc);
create index if not exists online_order_items_order_idx on public.online_order_items(online_order_id);
create index if not exists online_order_items_product_idx on public.online_order_items(product_id);

alter table public.online_orders enable row level security;
alter table public.online_order_items enable row level security;
revoke all on public.online_orders, public.online_order_items from anon, authenticated;
grant all on public.online_orders, public.online_order_items to service_role;
create policy commerce_server_only on public.online_orders for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.online_order_items for all to authenticated using (false) with check (false);

create or replace function public.commerce_create_online_order(
  p_branch_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_fulfillment_method text,
  p_delivery_address text,
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
  v_counter integer;
  v_order_number text;
  v_order_id uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_balance public.stock_balances%rowtype;
  v_product_id uuid;
  v_unit_id uuid;
  v_quantity numeric(18,3);
  v_base_quantity numeric(18,3);
  v_unit_price numeric(14,2);
  v_line_total numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_customer_id uuid;
begin
  if p_branch_id is null or coalesce(trim(p_customer_name), '') = '' or coalesce(trim(p_customer_phone), '') = ''
    or p_fulfillment_method not in ('pickup', 'delivery')
    or p_payment_method not in ('bank_transfer', 'qr', 'cash_on_pickup')
    or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid online order' using errcode = '22023';
  end if;

  if p_fulfillment_method = 'delivery' and coalesce(trim(p_delivery_address), '') = '' then
    raise exception 'delivery address is required' using errcode = '22023';
  end if;

  select id into v_customer_id from public.customers
  where phone = trim(p_customer_phone) and is_active = true
  order by created_at asc limit 1;

  insert into public.commerce_document_counters(branch_id, document_date, document_type, last_value)
  values (p_branch_id, current_date, 'online_order', 1)
  on conflict (branch_id, document_date, document_type)
  do update set last_value = public.commerce_document_counters.last_value + 1
  returning last_value into v_counter;
  v_order_number := format('WEB-%s-%s-%s', to_char(current_date, 'YYMMDD'), replace(p_branch_id::text, '-', ''), lpad(v_counter::text, 4, '0'));

  insert into public.online_orders(order_number, branch_id, customer_id, customer_name, customer_phone, customer_email, fulfillment_method, delivery_address, payment_method, note)
  values (v_order_number, p_branch_id, v_customer_id, trim(p_customer_name), trim(p_customer_phone), nullif(trim(p_customer_email), ''), p_fulfillment_method, case when p_fulfillment_method = 'delivery' then trim(p_delivery_address) else null end, p_payment_method, nullif(trim(p_note), ''))
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_unit_id := (v_item ->> 'product_unit_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    if v_quantity is null or v_quantity <= 0 then raise exception 'invalid item quantity' using errcode = '22023'; end if;

    select * into v_product from public.products where id = v_product_id and is_active = true;
    if not found then raise exception 'product is unavailable' using errcode = '22023'; end if;
    select * into v_unit from public.product_units where id = v_unit_id and product_id = v_product_id;
    if not found then raise exception 'product unit is invalid' using errcode = '22023'; end if;
    v_base_quantity := v_quantity * v_unit.conversion_to_base;

    select * into v_balance from public.stock_balances where branch_id = p_branch_id and product_id = v_product_id for update;
    if not found or v_balance.on_hand - v_balance.reserved - v_balance.damaged < v_base_quantity then
      raise exception 'insufficient stock for %', v_product.name using errcode = '22023';
    end if;

    select coalesce((
      select pp.price from public.product_prices pp
      where pp.product_id = v_product_id and pp.product_unit_id = v_unit_id and pp.customer_type = 'retail'
        and pp.is_active = true and (pp.branch_id is null or pp.branch_id = p_branch_id)
        and pp.minimum_quantity <= v_quantity and (pp.starts_at is null or pp.starts_at <= now()) and (pp.ends_at is null or pp.ends_at > now())
      order by (pp.branch_id is not null) desc, pp.priority desc, pp.minimum_quantity desc, pp.created_at desc limit 1
    ), v_product.default_sale_price) into v_unit_price;
    v_line_total := round(v_quantity * v_unit_price, 2);

    update public.stock_balances set reserved = reserved + v_base_quantity, updated_at = now()
    where branch_id = p_branch_id and product_id = v_product_id;
    insert into public.online_order_items(online_order_id, product_id, product_unit_id, product_name_snapshot, unit_name_snapshot, quantity, base_quantity, unit_price, line_total)
    values (v_order_id, v_product_id, v_unit_id, v_product.name, v_unit.name, v_quantity, v_base_quantity, v_unit_price, v_line_total);
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  update public.online_orders set subtotal = v_subtotal, grand_total = v_subtotal where id = v_order_id;
  insert into public.commerce_audit_logs(branch_id, action, entity_type, entity_id, payload)
  values (p_branch_id, 'online_order.created', 'online_order', v_order_id, jsonb_build_object('order_number', v_order_number));
  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'grand_total', v_subtotal, 'status', 'awaiting_payment');
end;
$$;

revoke all on function public.commerce_create_online_order(uuid, text, text, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.commerce_create_online_order(uuid, text, text, text, text, text, text, jsonb, text) to service_role;
