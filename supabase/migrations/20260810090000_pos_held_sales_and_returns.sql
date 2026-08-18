-- POS held bills and returns. These objects stay server-only and are called
-- through authenticated Next.js route handlers with the service role.

create table if not exists public.held_sales (
  id uuid primary key default gen_random_uuid(),
  held_number text not null unique,
  branch_id uuid not null references public.branches(id) on delete restrict,
  register_session_id uuid references public.pos_register_sessions(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  held_by_user_id uuid not null references public.users(id) on delete restrict,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  note text,
  status text not null default 'held' check (status in ('held', 'recalled', 'cancelled')),
  recalled_by_user_id uuid references public.users(id) on delete set null,
  recalled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists held_sales_branch_status_created_idx
  on public.held_sales(branch_id, status, created_at desc);
create index if not exists held_sales_user_status_created_idx
  on public.held_sales(held_by_user_id, status, created_at desc);

create table if not exists public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique,
  original_sale_id uuid not null references public.sales(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  register_session_id uuid not null references public.pos_register_sessions(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  performed_by_user_id uuid not null references public.users(id) on delete restrict,
  status text not null default 'completed' check (status in ('completed', 'voided')),
  refund_total numeric(14,2) not null check (refund_total >= 0),
  reason text not null,
  idempotency_key uuid not null default gen_random_uuid(),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (performed_by_user_id, idempotency_key)
);

create index if not exists sale_returns_original_sale_idx on public.sale_returns(original_sale_id, completed_at desc);
create index if not exists sale_returns_branch_completed_idx on public.sale_returns(branch_id, completed_at desc);

create table if not exists public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  sale_return_id uuid not null references public.sale_returns(id) on delete restrict,
  original_sale_item_id uuid not null references public.sale_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_unit_id uuid not null references public.product_units(id) on delete restrict,
  quantity numeric(18,3) not null check (quantity > 0),
  base_quantity numeric(18,3) not null check (base_quantity > 0),
  refund_amount numeric(14,2) not null check (refund_amount >= 0),
  created_at timestamptz not null default now(),
  unique (sale_return_id, original_sale_item_id)
);

create index if not exists sale_return_items_return_idx on public.sale_return_items(sale_return_id);
create index if not exists sale_return_items_original_item_idx on public.sale_return_items(original_sale_item_id);

create table if not exists public.return_refunds (
  id uuid primary key default gen_random_uuid(),
  sale_return_id uuid not null references public.sale_returns(id) on delete restrict,
  method text not null check (method in ('cash', 'qr', 'transfer', 'welfare', 'card', 'credit')),
  amount numeric(14,2) not null check (amount > 0),
  reference text,
  refunded_by_user_id uuid not null references public.users(id) on delete restrict,
  refunded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists return_refunds_return_idx on public.return_refunds(sale_return_id);
create index if not exists return_refunds_method_date_idx on public.return_refunds(method, refunded_at desc);

drop trigger if exists held_sales_set_updated_at on public.held_sales;
create trigger held_sales_set_updated_at before update on public.held_sales
for each row execute function public.set_updated_at_timestamp();

alter table public.held_sales enable row level security;
alter table public.sale_returns enable row level security;
alter table public.sale_return_items enable row level security;
alter table public.return_refunds enable row level security;

revoke all on table public.held_sales, public.sale_returns, public.sale_return_items, public.return_refunds from anon, authenticated;
grant all privileges on table public.held_sales, public.sale_returns, public.sale_return_items, public.return_refunds to service_role;

create policy commerce_server_only on public.held_sales for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.sale_returns for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.sale_return_items for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.return_refunds for all to authenticated using (false) with check (false);

create or replace function public.commerce_finalize_sale_return(
  p_user_id uuid,
  p_branch_id uuid,
  p_register_session_id uuid,
  p_original_sale_id uuid,
  p_items jsonb,
  p_refunds jsonb,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.user_role;
  v_actor_branch uuid;
  v_sale public.sales%rowtype;
  v_register_status text;
  v_existing_return public.sale_returns%rowtype;
  v_return_id uuid;
  v_return_number text;
  v_counter integer;
  v_item jsonb;
  v_refund jsonb;
  v_original_item public.sale_items%rowtype;
  v_quantity numeric(18,3);
  v_previously_returned numeric(18,3);
  v_base_quantity numeric(18,3);
  v_refund_amount numeric(14,2);
  v_refund_total numeric(14,2) := 0;
  v_refund_payment_total numeric(14,2) := 0;
  v_stock_before numeric(18,3);
  v_stock_after numeric(18,3);
  v_cash_refund numeric(14,2) := 0;
  v_has_unreturned_items boolean;
begin
  if p_user_id is null or p_branch_id is null or p_register_session_id is null or p_original_sale_id is null or p_idempotency_key is null then
    raise exception 'missing return context' using errcode = '22023';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a return reason is required' using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'return must contain at least one item' using errcode = '22023';
  end if;

  if jsonb_typeof(p_refunds) <> 'array' or jsonb_array_length(p_refunds) = 0 then
    raise exception 'return must contain at least one refund' using errcode = '22023';
  end if;

  select role, branch_id into v_actor_role, v_actor_branch
  from public.users
  where id = p_user_id and status = 'active'::public.user_status;

  if not found then
    raise exception 'active user not found' using errcode = '42501';
  end if;

  if v_actor_role <> 'admin'::public.user_role and v_actor_branch is distinct from p_branch_id then
    raise exception 'user cannot return for this branch' using errcode = '42501';
  end if;

  select * into v_existing_return
  from public.sale_returns
  where performed_by_user_id = p_user_id and idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object('return_id', v_existing_return.id, 'return_number', v_existing_return.return_number, 'refund_total', v_existing_return.refund_total, 'idempotent', true);
  end if;

  select status into v_register_status
  from public.pos_register_sessions
  where id = p_register_session_id and branch_id = p_branch_id and opened_by_user_id = p_user_id
  for update;

  if not found or v_register_status <> 'open' then
    raise exception 'an open POS register session is required' using errcode = '42501';
  end if;

  select * into v_sale from public.sales
  where id = p_original_sale_id and branch_id = p_branch_id
  for update;

  if not found or v_sale.status not in ('completed', 'partially_returned') then
    raise exception 'sale cannot be returned' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item ->> 'original_sale_item_id', '') = '' then
      raise exception 'missing original sale item' using errcode = '22023';
    end if;

    v_quantity := round((v_item ->> 'quantity')::numeric, 3);
    if v_quantity <= 0 then
      raise exception 'return quantity must be positive' using errcode = '22023';
    end if;

    select * into v_original_item from public.sale_items
    where id = (v_item ->> 'original_sale_item_id')::uuid and sale_id = p_original_sale_id
    for update;

    if not found then
      raise exception 'original sale item not found' using errcode = '22023';
    end if;

    select coalesce(sum(sri.quantity), 0) into v_previously_returned
    from public.sale_return_items sri
    join public.sale_returns sr on sr.id = sri.sale_return_id
    where sri.original_sale_item_id = v_original_item.id and sr.status = 'completed';

    if v_previously_returned + v_quantity > v_original_item.quantity then
      raise exception 'return quantity exceeds quantity sold' using errcode = '22023';
    end if;

    v_base_quantity := round(v_original_item.base_quantity / v_original_item.quantity * v_quantity, 3);
    v_refund_amount := round(v_original_item.line_total / v_original_item.quantity * v_quantity, 2);
    v_refund_total := v_refund_total + v_refund_amount;
  end loop;

  for v_refund in select value from jsonb_array_elements(p_refunds)
  loop
    if coalesce(v_refund ->> 'method', '') not in ('cash', 'qr', 'transfer', 'welfare', 'card', 'credit') then
      raise exception 'unsupported refund method' using errcode = '22023';
    end if;
    if round((v_refund ->> 'amount')::numeric, 2) <= 0 then
      raise exception 'refund amount must be positive' using errcode = '22023';
    end if;
    v_refund_payment_total := v_refund_payment_total + round((v_refund ->> 'amount')::numeric, 2);
    if v_refund ->> 'method' = 'cash' then
      v_cash_refund := v_cash_refund + round((v_refund ->> 'amount')::numeric, 2);
    end if;
  end loop;

  if abs(v_refund_payment_total - v_refund_total) > 0.01 then
    raise exception 'refund total must match returned item value' using errcode = '22023';
  end if;

  insert into public.commerce_document_counters(branch_id, document_date, document_type, last_value)
  values (p_branch_id, current_date, 'return', 1)
  on conflict (branch_id, document_date, document_type)
  do update set last_value = public.commerce_document_counters.last_value + 1
  returning last_value into v_counter;

  v_return_number := format('RT-%s-%s', to_char(current_date, 'YYMMDD'), lpad(v_counter::text, 4, '0'));

  insert into public.sale_returns(return_number, original_sale_id, branch_id, register_session_id, customer_id, performed_by_user_id, refund_total, reason, idempotency_key)
  values (v_return_number, p_original_sale_id, p_branch_id, p_register_session_id, v_sale.customer_id, p_user_id, v_refund_total, trim(p_reason), p_idempotency_key)
  returning id into v_return_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_original_item from public.sale_items
    where id = (v_item ->> 'original_sale_item_id')::uuid and sale_id = p_original_sale_id
    for update;

    v_quantity := round((v_item ->> 'quantity')::numeric, 3);
    v_base_quantity := round(v_original_item.base_quantity / v_original_item.quantity * v_quantity, 3);
    v_refund_amount := round(v_original_item.line_total / v_original_item.quantity * v_quantity, 2);

    insert into public.sale_return_items(sale_return_id, original_sale_item_id, product_id, product_unit_id, quantity, base_quantity, refund_amount)
    values (v_return_id, v_original_item.id, v_original_item.product_id, v_original_item.product_unit_id, v_quantity, v_base_quantity, v_refund_amount);

    insert into public.stock_balances(branch_id, product_id) values (p_branch_id, v_original_item.product_id)
    on conflict (branch_id, product_id) do nothing;

    select on_hand into v_stock_before from public.stock_balances
    where branch_id = p_branch_id and product_id = v_original_item.product_id
    for update;

    v_stock_after := v_stock_before + v_base_quantity;

    update public.stock_balances set on_hand = v_stock_after, updated_at = now()
    where branch_id = p_branch_id and product_id = v_original_item.product_id;

    insert into public.stock_movements(branch_id, product_id, movement_type, quantity_before, quantity_delta, quantity_after, reference_type, reference_id, performed_by_user_id, note)
    values (p_branch_id, v_original_item.product_id, 'return', v_stock_before, v_base_quantity, v_stock_after, 'sale_return', v_return_id, p_user_id, trim(p_reason));
  end loop;

  for v_refund in select value from jsonb_array_elements(p_refunds)
  loop
    insert into public.return_refunds(sale_return_id, method, amount, reference, refunded_by_user_id)
    values (v_return_id, v_refund ->> 'method', round((v_refund ->> 'amount')::numeric, 2), nullif(trim(coalesce(v_refund ->> 'reference', '')), ''), p_user_id);
  end loop;

  update public.pos_register_sessions
  set expected_cash = expected_cash - v_cash_refund, updated_at = now()
  where id = p_register_session_id;

  select exists (
    select 1
    from public.sale_items si
    where si.sale_id = p_original_sale_id
      and si.quantity > coalesce((
        select sum(sri.quantity)
        from public.sale_return_items sri
        join public.sale_returns sr on sr.id = sri.sale_return_id
        where sri.original_sale_item_id = si.id and sr.status = 'completed'
      ), 0)
  ) into v_has_unreturned_items;

  update public.sales
  set status = case when v_has_unreturned_items then 'partially_returned' else 'returned' end
  where id = p_original_sale_id;

  insert into public.commerce_audit_logs(actor_user_id, branch_id, action, entity_type, entity_id, payload)
  values (p_user_id, p_branch_id, 'sale.returned', 'sale_return', v_return_id, jsonb_build_object('return_number', v_return_number, 'original_sale_id', p_original_sale_id, 'refund_total', v_refund_total));

  return jsonb_build_object('return_id', v_return_id, 'return_number', v_return_number, 'refund_total', v_refund_total, 'idempotent', false);
end;
$$;

revoke all on function public.commerce_finalize_sale_return(uuid, uuid, uuid, uuid, jsonb, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.commerce_finalize_sale_return(uuid, uuid, uuid, uuid, jsonb, jsonb, text, uuid) to service_role;
