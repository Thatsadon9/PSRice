-- PS Rice Commerce Foundation
-- Additive only: the existing Workforce schema and data remain untouched.

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.product_categories(id) on delete set null,
  sku text not null,
  barcode text,
  name text not null,
  description text,
  base_unit_code text not null default 'kg',
  default_sale_price numeric(14,2) not null default 0 check (default_sale_price >= 0),
  default_cost_price numeric(14,2) not null default 0 check (default_cost_price >= 0),
  reorder_point numeric(18,3) not null default 0 check (reorder_point >= 0),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sku),
  unique (barcode)
);

create table if not exists public.product_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  code text not null,
  name text not null,
  conversion_to_base numeric(18,3) not null check (conversion_to_base > 0),
  barcode text,
  is_default boolean not null default false,
  allow_decimal boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, code),
  unique (barcode)
);

create unique index if not exists product_units_one_default_per_product
  on public.product_units(product_id)
  where is_default;

create table if not exists public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  product_unit_id uuid not null references public.product_units(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  customer_type text not null default 'retail' check (customer_type in ('retail', 'member', 'wholesale', 'dealer')),
  minimum_quantity numeric(18,3) not null default 0 check (minimum_quantity >= 0),
  price numeric(14,2) not null check (price >= 0),
  priority integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists product_prices_lookup_idx
  on public.product_prices(product_id, product_unit_id, branch_id, customer_type, is_active, minimum_quantity desc, priority desc);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  member_code text,
  customer_type text not null default 'retail' check (customer_type in ('retail', 'member', 'wholesale', 'dealer')),
  points_balance numeric(14,2) not null default 0 check (points_balance >= 0),
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_code)
);

create index if not exists customers_phone_idx on public.customers(phone);

create table if not exists public.stock_balances (
  branch_id uuid not null references public.branches(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  on_hand numeric(18,3) not null default 0 check (on_hand >= 0),
  reserved numeric(18,3) not null default 0 check (reserved >= 0),
  damaged numeric(18,3) not null default 0 check (damaged >= 0),
  updated_at timestamptz not null default now(),
  primary key (branch_id, product_id)
);

create table if not exists public.pos_register_sessions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  opened_by_user_id uuid not null references public.users(id) on delete restrict,
  closed_by_user_id uuid references public.users(id) on delete restrict,
  register_name text not null default 'Counter 1',
  opening_float numeric(14,2) not null default 0 check (opening_float >= 0),
  expected_cash numeric(14,2) not null default 0,
  counted_cash numeric(14,2),
  cash_variance numeric(14,2),
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'open' and closed_at is null) or status = 'closed')
);

create unique index if not exists pos_register_one_open_session_per_user
  on public.pos_register_sessions(branch_id, opened_by_user_id, register_name)
  where status = 'open';

create table if not exists public.commerce_document_counters (
  branch_id uuid not null references public.branches(id) on delete restrict,
  document_date date not null,
  document_type text not null check (document_type in ('sale', 'return', 'purchase', 'transfer')),
  last_value integer not null default 0 check (last_value >= 0),
  primary key (branch_id, document_date, document_type)
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  branch_id uuid not null references public.branches(id) on delete restrict,
  register_session_id uuid references public.pos_register_sessions(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  performed_by_user_id uuid not null references public.users(id) on delete restrict,
  source_channel text not null default 'pos' check (source_channel in ('pos', 'online', 'phone', 'line', 'agent')),
  status text not null default 'completed' check (status in ('completed', 'voided', 'partially_returned', 'returned')),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(14,2) not null default 0 check (discount_total >= 0),
  grand_total numeric(14,2) not null default 0 check (grand_total >= 0),
  payment_total numeric(14,2) not null default 0 check (payment_total >= 0),
  idempotency_key uuid not null default gen_random_uuid(),
  note text,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (performed_by_user_id, idempotency_key)
);

create index if not exists sales_branch_completed_idx on public.sales(branch_id, completed_at desc);
create index if not exists sales_customer_idx on public.sales(customer_id, completed_at desc);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_unit_id uuid not null references public.product_units(id) on delete restrict,
  product_name_snapshot text not null,
  unit_name_snapshot text not null,
  quantity numeric(18,3) not null check (quantity > 0),
  base_quantity numeric(18,3) not null check (base_quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  unit_cost_snapshot numeric(14,2) not null default 0 check (unit_cost_snapshot >= 0),
  created_at timestamptz not null default now(),
  check (discount_amount <= quantity * unit_price)
);

create index if not exists sale_items_sale_idx on public.sale_items(sale_id);
create index if not exists sale_items_product_idx on public.sale_items(product_id, created_at desc);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  method text not null check (method in ('cash', 'qr', 'transfer', 'welfare', 'card', 'credit')),
  amount numeric(14,2) not null check (amount > 0),
  reference text,
  received_by_user_id uuid not null references public.users(id) on delete restrict,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists payments_sale_idx on public.payments(sale_id);
create index if not exists payments_method_date_idx on public.payments(method, received_at desc);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('opening', 'receive', 'sale', 'return', 'transfer_in', 'transfer_out', 'adjustment_in', 'adjustment_out', 'damage', 'expired', 'internal_use')),
  quantity_before numeric(18,3) not null,
  quantity_delta numeric(18,3) not null check (quantity_delta <> 0),
  quantity_after numeric(18,3) not null check (quantity_after >= 0),
  reference_type text not null,
  reference_id uuid,
  note text,
  performed_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_branch_product_idx on public.stock_movements(branch_id, product_id, created_at desc);

create table if not exists public.commerce_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists commerce_audit_logs_entity_idx on public.commerce_audit_logs(entity_type, entity_id, created_at desc);

create or replace function private.can_operate_commerce_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.status = 'active'::public.user_status
      and (
        u.role = 'admin'::public.user_role
        or u.branch_id = target_branch_id
      )
  );
$$;

revoke all on function private.can_operate_commerce_branch(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.can_operate_commerce_branch(uuid) to authenticated;

create or replace function public.commerce_finalize_pos_sale(
  p_user_id uuid,
  p_branch_id uuid,
  p_register_session_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_idempotency_key uuid,
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
  v_receipt_number text;
  v_counter integer;
  v_sale_id uuid;
  v_existing_sale public.sales%rowtype;
  v_item jsonb;
  v_resolved_item jsonb;
  v_resolved_items jsonb := '[]'::jsonb;
  v_payment jsonb;
  v_product_id uuid;
  v_product_unit_id uuid;
  v_quantity numeric(18,3);
  v_base_quantity numeric(18,3);
  v_discount numeric(14,2);
  v_product_name text;
  v_unit_name text;
  v_conversion numeric(18,3);
  v_default_price numeric(14,2);
  v_unit_cost numeric(14,2);
  v_unit_price numeric(14,2);
  v_line_gross numeric(14,2);
  v_line_total numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_discount_total numeric(14,2) := 0;
  v_grand_total numeric(14,2) := 0;
  v_payment_total numeric(14,2) := 0;
  v_stock_before numeric(18,3);
  v_stock_after numeric(18,3);
  v_register_status text;
begin
  if p_user_id is null or p_branch_id is null or p_idempotency_key is null then
    raise exception 'missing sale context' using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'sale must contain at least one item' using errcode = '22023';
  end if;

  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'sale must contain at least one payment' using errcode = '22023';
  end if;

  select u.role, u.branch_id
  into v_actor_role, v_actor_branch
  from public.users u
  where u.id = p_user_id
    and u.status = 'active'::public.user_status;

  if not found then
    raise exception 'active user not found' using errcode = '42501';
  end if;

  if v_actor_role <> 'admin'::public.user_role and v_actor_branch is distinct from p_branch_id then
    raise exception 'user cannot sell for this branch' using errcode = '42501';
  end if;

  select * into v_existing_sale
  from public.sales
  where performed_by_user_id = p_user_id
    and idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'sale_id', v_existing_sale.id,
      'receipt_number', v_existing_sale.receipt_number,
      'grand_total', v_existing_sale.grand_total,
      'idempotent', true
    );
  end if;

  if p_register_session_id is not null then
    select status into v_register_status
    from public.pos_register_sessions
    where id = p_register_session_id
      and branch_id = p_branch_id
      and opened_by_user_id = p_user_id
    for update;

    if not found or v_register_status <> 'open' then
      raise exception 'an open POS register session is required' using errcode = '42501';
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_product_unit_id := (v_item ->> 'product_unit_id')::uuid;
    v_quantity := round((v_item ->> 'quantity')::numeric, 3);
    v_discount := round(coalesce((v_item ->> 'discount_amount')::numeric, 0), 2);

    if v_quantity <= 0 or v_discount < 0 then
      raise exception 'invalid item quantity or discount' using errcode = '22023';
    end if;

    select p.name, p.default_sale_price, p.default_cost_price, pu.name, pu.conversion_to_base
    into v_product_name, v_default_price, v_unit_cost, v_unit_name, v_conversion
    from public.products p
    join public.product_units pu on pu.id = v_product_unit_id and pu.product_id = p.id
    where p.id = v_product_id
      and p.is_active;

    if not found then
      raise exception 'active product unit not found' using errcode = '22023';
    end if;

    select pp.price
    into v_unit_price
    from public.product_prices pp
    where pp.product_id = v_product_id
      and pp.product_unit_id = v_product_unit_id
      and pp.is_active
      and (pp.branch_id = p_branch_id or pp.branch_id is null)
      and pp.customer_type = 'retail'
      and pp.minimum_quantity <= v_quantity
      and (pp.starts_at is null or pp.starts_at <= now())
      and (pp.ends_at is null or pp.ends_at > now())
    order by (pp.branch_id is not null) desc, pp.priority desc, pp.minimum_quantity desc, pp.created_at desc
    limit 1;

    v_unit_price := coalesce(v_unit_price, v_default_price);
    v_base_quantity := round(v_quantity * v_conversion, 3);
    v_line_gross := round(v_quantity * v_unit_price, 2);

    if v_discount > v_line_gross then
      raise exception 'item discount exceeds line total' using errcode = '22023';
    end if;

    v_line_total := v_line_gross - v_discount;
    v_subtotal := v_subtotal + v_line_gross;
    v_discount_total := v_discount_total + v_discount;
    v_resolved_items := v_resolved_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'product_unit_id', v_product_unit_id,
      'product_name', v_product_name,
      'unit_name', v_unit_name,
      'quantity', v_quantity,
      'base_quantity', v_base_quantity,
      'unit_price', v_unit_price,
      'discount_amount', v_discount,
      'line_total', v_line_total,
      'unit_cost', v_unit_cost
    ));
  end loop;

  v_grand_total := v_subtotal - v_discount_total;

  for v_payment in select value from jsonb_array_elements(p_payments)
  loop
    if coalesce(v_payment ->> 'method', '') not in ('cash', 'qr', 'transfer', 'welfare', 'card', 'credit') then
      raise exception 'unsupported payment method' using errcode = '22023';
    end if;

    if round((v_payment ->> 'amount')::numeric, 2) <= 0 then
      raise exception 'payment amount must be positive' using errcode = '22023';
    end if;

    v_payment_total := v_payment_total + round((v_payment ->> 'amount')::numeric, 2);
  end loop;

  if abs(v_payment_total - v_grand_total) > 0.01 then
    raise exception 'payment total must match sale total' using errcode = '22023';
  end if;

  insert into public.commerce_document_counters(branch_id, document_date, document_type, last_value)
  values (p_branch_id, current_date, 'sale', 1)
  on conflict (branch_id, document_date, document_type)
  do update set last_value = public.commerce_document_counters.last_value + 1
  returning last_value into v_counter;

  v_receipt_number := format('PS-%s-%s', to_char(current_date, 'YYMMDD'), lpad(v_counter::text, 4, '0'));

  insert into public.sales (
    receipt_number, branch_id, register_session_id, customer_id, performed_by_user_id,
    subtotal, discount_total, grand_total, payment_total, idempotency_key, note
  ) values (
    v_receipt_number, p_branch_id, p_register_session_id, p_customer_id, p_user_id,
    v_subtotal, v_discount_total, v_grand_total, v_payment_total, p_idempotency_key, nullif(trim(p_note), '')
  ) returning id into v_sale_id;

  for v_resolved_item in select value from jsonb_array_elements(v_resolved_items)
  loop
    v_product_id := (v_resolved_item ->> 'product_id')::uuid;
    v_base_quantity := (v_resolved_item ->> 'base_quantity')::numeric;

    insert into public.stock_balances(branch_id, product_id)
    values (p_branch_id, v_product_id)
    on conflict (branch_id, product_id) do nothing;

    select on_hand into v_stock_before
    from public.stock_balances
    where branch_id = p_branch_id and product_id = v_product_id
    for update;

    if v_stock_before < v_base_quantity then
      raise exception 'insufficient stock for product %', (v_resolved_item ->> 'product_name') using errcode = '22023';
    end if;

    v_stock_after := v_stock_before - v_base_quantity;

    insert into public.sale_items (
      sale_id, product_id, product_unit_id, product_name_snapshot, unit_name_snapshot,
      quantity, base_quantity, unit_price, discount_amount, line_total, unit_cost_snapshot
    ) values (
      v_sale_id, v_product_id, (v_resolved_item ->> 'product_unit_id')::uuid,
      v_resolved_item ->> 'product_name', v_resolved_item ->> 'unit_name',
      (v_resolved_item ->> 'quantity')::numeric, v_base_quantity,
      (v_resolved_item ->> 'unit_price')::numeric, (v_resolved_item ->> 'discount_amount')::numeric,
      (v_resolved_item ->> 'line_total')::numeric, (v_resolved_item ->> 'unit_cost')::numeric
    );

    update public.stock_balances
    set on_hand = v_stock_after, updated_at = now()
    where branch_id = p_branch_id and product_id = v_product_id;

    insert into public.stock_movements (
      branch_id, product_id, movement_type, quantity_before, quantity_delta, quantity_after,
      reference_type, reference_id, performed_by_user_id
    ) values (
      p_branch_id, v_product_id, 'sale', v_stock_before, -v_base_quantity, v_stock_after,
      'sale', v_sale_id, p_user_id
    );
  end loop;

  for v_payment in select value from jsonb_array_elements(p_payments)
  loop
    insert into public.payments (sale_id, method, amount, reference, received_by_user_id)
    values (
      v_sale_id,
      v_payment ->> 'method',
      round((v_payment ->> 'amount')::numeric, 2),
      nullif(trim(coalesce(v_payment ->> 'reference', '')), ''),
      p_user_id
    );
  end loop;

  if p_register_session_id is not null then
    update public.pos_register_sessions
    set expected_cash = expected_cash + coalesce((
      select sum((p.value ->> 'amount')::numeric)
      from jsonb_array_elements(p_payments) p
      where p.value ->> 'method' = 'cash'
    ), 0), updated_at = now()
    where id = p_register_session_id;
  end if;

  insert into public.commerce_audit_logs(actor_user_id, branch_id, action, entity_type, entity_id, payload)
  values (
    p_user_id, p_branch_id, 'sale.completed', 'sale', v_sale_id,
    jsonb_build_object('receipt_number', v_receipt_number, 'grand_total', v_grand_total)
  );

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'receipt_number', v_receipt_number,
    'grand_total', v_grand_total,
    'idempotent', false
  );
end;
$$;

revoke all on function public.commerce_finalize_pos_sale(uuid, uuid, uuid, uuid, jsonb, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.commerce_finalize_pos_sale(uuid, uuid, uuid, uuid, jsonb, jsonb, uuid, text) to service_role;

drop trigger if exists product_categories_set_updated_at on public.product_categories;
create trigger product_categories_set_updated_at before update on public.product_categories
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists product_units_set_updated_at on public.product_units;
create trigger product_units_set_updated_at before update on public.product_units
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists product_prices_set_updated_at on public.product_prices;
create trigger product_prices_set_updated_at before update on public.product_prices
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists pos_register_sessions_set_updated_at on public.pos_register_sessions;
create trigger pos_register_sessions_set_updated_at before update on public.pos_register_sessions
for each row execute function public.set_updated_at_timestamp();

alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_units enable row level security;
alter table public.product_prices enable row level security;
alter table public.customers enable row level security;
alter table public.stock_balances enable row level security;
alter table public.pos_register_sessions enable row level security;
alter table public.commerce_document_counters enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.stock_movements enable row level security;
alter table public.commerce_audit_logs enable row level security;

revoke all on table public.product_categories, public.products, public.product_units, public.product_prices,
  public.customers, public.stock_balances, public.pos_register_sessions, public.commerce_document_counters,
  public.sales, public.sale_items, public.payments, public.stock_movements, public.commerce_audit_logs
from anon, authenticated;

grant all privileges on table public.product_categories, public.products, public.product_units, public.product_prices,
  public.customers, public.stock_balances, public.pos_register_sessions, public.commerce_document_counters,
  public.sales, public.sale_items, public.payments, public.stock_movements, public.commerce_audit_logs
to service_role;
