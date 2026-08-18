-- Purchasing and receiving. Receiving is finalized atomically so stock,
-- purchase quantities, cost snapshots and the audit trail never diverge.

alter table public.commerce_document_counters
  drop constraint if exists commerce_document_counters_document_type_check;
alter table public.commerce_document_counters
  add constraint commerce_document_counters_document_type_check
  check (document_type in ('sale', 'return', 'purchase', 'goods_receipt', 'transfer'));

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  tax_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  purchase_order_number text not null unique,
  branch_id uuid not null references public.branches(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'partially_received', 'received', 'cancelled')),
  ordered_at timestamptz not null default now(),
  expected_at timestamptz,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(14,2) not null default 0 check (discount_total >= 0),
  grand_total numeric(14,2) not null default 0 check (grand_total >= 0),
  note text,
  created_by_user_id uuid not null references public.users(id) on delete restrict,
  approved_by_user_id uuid references public.users(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchase_orders_branch_status_ordered_idx on public.purchase_orders(branch_id, status, ordered_at desc);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders(supplier_id, ordered_at desc);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_unit_id uuid not null references public.product_units(id) on delete restrict,
  quantity_ordered numeric(18,3) not null check (quantity_ordered > 0),
  quantity_received numeric(18,3) not null default 0 check (quantity_received >= 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  check (quantity_received <= quantity_ordered)
);

create index if not exists purchase_order_items_order_idx on public.purchase_order_items(purchase_order_id);
create index if not exists purchase_order_items_product_idx on public.purchase_order_items(product_id);

create table if not exists public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_number text not null unique,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  received_by_user_id uuid not null references public.users(id) on delete restrict,
  received_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists goods_receipts_order_idx on public.goods_receipts(purchase_order_id, received_at desc);
create index if not exists goods_receipts_branch_idx on public.goods_receipts(branch_id, received_at desc);

create table if not exists public.goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references public.goods_receipts(id) on delete restrict,
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_unit_id uuid not null references public.product_units(id) on delete restrict,
  quantity numeric(18,3) not null check (quantity > 0),
  base_quantity numeric(18,3) not null check (base_quantity > 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  unique (goods_receipt_id, purchase_order_item_id)
);

create index if not exists goods_receipt_items_receipt_idx on public.goods_receipt_items(goods_receipt_id);
create index if not exists goods_receipt_items_product_idx on public.goods_receipt_items(product_id);

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at before update on public.suppliers for each row execute function public.set_updated_at_timestamp();
drop trigger if exists purchase_orders_set_updated_at on public.purchase_orders;
create trigger purchase_orders_set_updated_at before update on public.purchase_orders for each row execute function public.set_updated_at_timestamp();

alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_items enable row level security;

revoke all on table public.suppliers, public.purchase_orders, public.purchase_order_items, public.goods_receipts, public.goods_receipt_items from anon, authenticated;
grant all privileges on table public.suppliers, public.purchase_orders, public.purchase_order_items, public.goods_receipts, public.goods_receipt_items to service_role;
create policy commerce_server_only on public.suppliers for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.purchase_orders for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.purchase_order_items for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.goods_receipts for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.goods_receipt_items for all to authenticated using (false) with check (false);

create or replace function public.commerce_receive_purchase_order(
  p_user_id uuid,
  p_branch_id uuid,
  p_purchase_order_id uuid,
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
  v_order public.purchase_orders%rowtype;
  v_item jsonb;
  v_po_item public.purchase_order_items%rowtype;
  v_product_unit public.product_units%rowtype;
  v_quantity numeric(18,3);
  v_base_quantity numeric(18,3);
  v_unit_cost numeric(14,2);
  v_receipt_id uuid;
  v_receipt_number text;
  v_counter integer;
  v_before numeric(18,3);
  v_after numeric(18,3);
  v_has_outstanding boolean;
begin
  if p_user_id is null or p_branch_id is null or p_purchase_order_id is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid goods receipt' using errcode = '22023';
  end if;
  select role, branch_id into v_actor_role, v_actor_branch from public.users where id = p_user_id and status = 'active'::public.user_status;
  if not found or v_actor_role = 'employee'::public.user_role then raise exception 'purchasing access denied' using errcode = '42501'; end if;
  if v_actor_role <> 'admin'::public.user_role and v_actor_branch is distinct from p_branch_id then raise exception 'branch access denied' using errcode = '42501'; end if;

  select * into v_order from public.purchase_orders where id = p_purchase_order_id and branch_id = p_branch_id for update;
  if not found or v_order.status not in ('submitted', 'approved', 'partially_received') then raise exception 'purchase order cannot be received' using errcode = '22023'; end if;

  insert into public.commerce_document_counters(branch_id, document_date, document_type, last_value)
  values (p_branch_id, current_date, 'goods_receipt', 1)
  on conflict (branch_id, document_date, document_type) do update set last_value = public.commerce_document_counters.last_value + 1
  returning last_value into v_counter;
  v_receipt_number := format('GR-%s-%s', to_char(current_date, 'YYMMDD'), lpad(v_counter::text, 4, '0'));
  insert into public.goods_receipts(goods_receipt_number, purchase_order_id, branch_id, supplier_id, received_by_user_id, note)
  values (v_receipt_number, p_purchase_order_id, p_branch_id, v_order.supplier_id, p_user_id, nullif(trim(p_note), '')) returning id into v_receipt_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := round((v_item ->> 'quantity')::numeric, 3);
    if v_quantity <= 0 then raise exception 'receipt quantity must be positive' using errcode = '22023'; end if;
    select * into v_po_item from public.purchase_order_items where id = (v_item ->> 'purchase_order_item_id')::uuid and purchase_order_id = p_purchase_order_id for update;
    if not found then raise exception 'purchase order item not found' using errcode = '22023'; end if;
    if v_po_item.quantity_received + v_quantity > v_po_item.quantity_ordered then raise exception 'received quantity exceeds ordered quantity' using errcode = '22023'; end if;
    select * into v_product_unit from public.product_units where id = v_po_item.product_unit_id and product_id = v_po_item.product_id;
    if not found then raise exception 'product unit not found' using errcode = '22023'; end if;
    v_unit_cost := round(coalesce((v_item ->> 'unit_cost')::numeric, v_po_item.unit_cost), 2);
    if v_unit_cost < 0 then raise exception 'invalid received cost' using errcode = '22023'; end if;
    v_base_quantity := round(v_quantity * v_product_unit.conversion_to_base, 3);
    insert into public.goods_receipt_items(goods_receipt_id, purchase_order_item_id, product_id, product_unit_id, quantity, base_quantity, unit_cost)
    values (v_receipt_id, v_po_item.id, v_po_item.product_id, v_po_item.product_unit_id, v_quantity, v_base_quantity, v_unit_cost);
    update public.purchase_order_items set quantity_received = quantity_received + v_quantity where id = v_po_item.id;
    insert into public.stock_balances(branch_id, product_id) values (p_branch_id, v_po_item.product_id) on conflict (branch_id, product_id) do nothing;
    select on_hand into v_before from public.stock_balances where branch_id = p_branch_id and product_id = v_po_item.product_id for update;
    v_after := v_before + v_base_quantity;
    update public.stock_balances set on_hand = v_after, updated_at = now() where branch_id = p_branch_id and product_id = v_po_item.product_id;
    update public.products set default_cost_price = v_unit_cost, updated_at = now() where id = v_po_item.product_id;
    insert into public.stock_movements(branch_id, product_id, movement_type, quantity_before, quantity_delta, quantity_after, reference_type, reference_id, performed_by_user_id, note)
    values (p_branch_id, v_po_item.product_id, 'receive', v_before, v_base_quantity, v_after, 'goods_receipt', v_receipt_id, p_user_id, nullif(trim(p_note), ''));
  end loop;

  select exists(select 1 from public.purchase_order_items where purchase_order_id = p_purchase_order_id and quantity_received < quantity_ordered) into v_has_outstanding;
  update public.purchase_orders set status = case when v_has_outstanding then 'partially_received' else 'received' end, updated_at = now() where id = p_purchase_order_id;
  insert into public.commerce_audit_logs(actor_user_id, branch_id, action, entity_type, entity_id, payload)
  values (p_user_id, p_branch_id, 'purchase.received', 'goods_receipt', v_receipt_id, jsonb_build_object('goods_receipt_number', v_receipt_number, 'purchase_order_id', p_purchase_order_id));
  return jsonb_build_object('goods_receipt_id', v_receipt_id, 'goods_receipt_number', v_receipt_number);
end;
$$;

revoke all on function public.commerce_receive_purchase_order(uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.commerce_receive_purchase_order(uuid, uuid, uuid, jsonb, text) to service_role;
