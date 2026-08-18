alter table public.commerce_document_counters
  drop constraint if exists commerce_document_counters_document_type_check;
alter table public.commerce_document_counters
  add constraint commerce_document_counters_document_type_check
  check (document_type in ('sale', 'return', 'purchase', 'goods_receipt', 'transfer'));

create table if not exists public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_number text not null unique,
  source_branch_id uuid not null references public.branches(id) on delete restrict,
  destination_branch_id uuid not null references public.branches(id) on delete restrict,
  status text not null default 'requested' check (status in ('draft', 'requested', 'approved', 'in_transit', 'received', 'cancelled', 'problem')),
  requested_by_user_id uuid not null references public.users(id) on delete restrict,
  approved_by_user_id uuid references public.users(id) on delete restrict,
  shipped_by_user_id uuid references public.users(id) on delete restrict,
  received_by_user_id uuid references public.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  shipped_at timestamptz,
  received_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_branch_id <> destination_branch_id)
);

create index if not exists stock_transfers_source_status_idx on public.stock_transfers(source_branch_id, status, requested_at desc);
create index if not exists stock_transfers_destination_status_idx on public.stock_transfers(destination_branch_id, status, requested_at desc);

create table if not exists public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  stock_transfer_id uuid not null references public.stock_transfers(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_unit_id uuid not null references public.product_units(id) on delete restrict,
  quantity_requested numeric(18,3) not null check (quantity_requested > 0),
  quantity_shipped numeric(18,3) not null default 0 check (quantity_shipped >= 0),
  quantity_received numeric(18,3) not null default 0 check (quantity_received >= 0),
  base_quantity_shipped numeric(18,3) not null default 0 check (base_quantity_shipped >= 0),
  created_at timestamptz not null default now(),
  check (quantity_shipped <= quantity_requested),
  check (quantity_received <= quantity_shipped)
);
create index if not exists stock_transfer_items_transfer_idx on public.stock_transfer_items(stock_transfer_id);
create index if not exists stock_transfer_items_product_idx on public.stock_transfer_items(product_id);

drop trigger if exists stock_transfers_set_updated_at on public.stock_transfers;
create trigger stock_transfers_set_updated_at before update on public.stock_transfers for each row execute function public.set_updated_at_timestamp();

alter table public.stock_transfers enable row level security;
alter table public.stock_transfer_items enable row level security;
revoke all on table public.stock_transfers, public.stock_transfer_items from anon, authenticated;
grant all privileges on table public.stock_transfers, public.stock_transfer_items to service_role;
create policy commerce_server_only on public.stock_transfers for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.stock_transfer_items for all to authenticated using (false) with check (false);

create or replace function public.commerce_next_transfer_number(p_branch_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_counter integer;
begin
  insert into public.commerce_document_counters(branch_id, document_date, document_type, last_value) values (p_branch_id, current_date, 'transfer', 1)
  on conflict (branch_id, document_date, document_type) do update set last_value = public.commerce_document_counters.last_value + 1 returning last_value into v_counter;
  return format('TR-%s-%s', to_char(current_date, 'YYMMDD'), lpad(v_counter::text, 4, '0'));
end; $$;

create or replace function public.commerce_ship_stock_transfer(p_user_id uuid, p_source_branch_id uuid, p_transfer_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role public.user_role; v_branch uuid; v_transfer public.stock_transfers%rowtype; v_item public.stock_transfer_items%rowtype; v_unit public.product_units%rowtype; v_before numeric(18,3); v_after numeric(18,3); v_base numeric(18,3);
begin
  select role, branch_id into v_role, v_branch from public.users where id = p_user_id and status = 'active'::public.user_status;
  if not found or v_role = 'employee'::public.user_role then raise exception 'transfer access denied' using errcode = '42501'; end if;
  if v_role <> 'admin'::public.user_role and v_branch is distinct from p_source_branch_id then raise exception 'source branch access denied' using errcode = '42501'; end if;
  select * into v_transfer from public.stock_transfers where id = p_transfer_id and source_branch_id = p_source_branch_id for update;
  if not found or v_transfer.status not in ('requested', 'approved') then raise exception 'transfer cannot be shipped' using errcode = '22023'; end if;
  for v_item in select * from public.stock_transfer_items where stock_transfer_id = p_transfer_id for update loop
    select * into v_unit from public.product_units where id = v_item.product_unit_id and product_id = v_item.product_id;
    if not found then raise exception 'transfer product unit not found' using errcode = '22023'; end if;
    v_base := round(v_item.quantity_requested * v_unit.conversion_to_base, 3);
    insert into public.stock_balances(branch_id, product_id) values (p_source_branch_id, v_item.product_id) on conflict (branch_id, product_id) do nothing;
    select on_hand into v_before from public.stock_balances where branch_id = p_source_branch_id and product_id = v_item.product_id for update;
    if v_before < v_base then raise exception 'insufficient stock for transfer' using errcode = '22023'; end if;
    v_after := v_before - v_base;
    update public.stock_balances set on_hand = v_after, updated_at = now() where branch_id = p_source_branch_id and product_id = v_item.product_id;
    update public.stock_transfer_items set quantity_shipped = quantity_requested, base_quantity_shipped = v_base where id = v_item.id;
    insert into public.stock_movements(branch_id, product_id, movement_type, quantity_before, quantity_delta, quantity_after, reference_type, reference_id, performed_by_user_id)
    values (p_source_branch_id, v_item.product_id, 'transfer_out', v_before, -v_base, v_after, 'stock_transfer', p_transfer_id, p_user_id);
  end loop;
  update public.stock_transfers set status = 'in_transit', shipped_by_user_id = p_user_id, shipped_at = now(), updated_at = now() where id = p_transfer_id;
  insert into public.commerce_audit_logs(actor_user_id, branch_id, action, entity_type, entity_id) values (p_user_id, p_source_branch_id, 'transfer.shipped', 'stock_transfer', p_transfer_id);
  return jsonb_build_object('transfer_id', p_transfer_id, 'status', 'in_transit');
end; $$;

create or replace function public.commerce_receive_stock_transfer(p_user_id uuid, p_destination_branch_id uuid, p_transfer_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role public.user_role; v_branch uuid; v_transfer public.stock_transfers%rowtype; v_item public.stock_transfer_items%rowtype; v_before numeric(18,3); v_after numeric(18,3);
begin
  select role, branch_id into v_role, v_branch from public.users where id = p_user_id and status = 'active'::public.user_status;
  if not found or v_role = 'employee'::public.user_role then raise exception 'transfer access denied' using errcode = '42501'; end if;
  if v_role <> 'admin'::public.user_role and v_branch is distinct from p_destination_branch_id then raise exception 'destination branch access denied' using errcode = '42501'; end if;
  select * into v_transfer from public.stock_transfers where id = p_transfer_id and destination_branch_id = p_destination_branch_id for update;
  if not found or v_transfer.status <> 'in_transit' then raise exception 'transfer cannot be received' using errcode = '22023'; end if;
  for v_item in select * from public.stock_transfer_items where stock_transfer_id = p_transfer_id for update loop
    if v_item.quantity_shipped <= 0 or v_item.base_quantity_shipped <= 0 then raise exception 'transfer has no shipped quantity' using errcode = '22023'; end if;
    insert into public.stock_balances(branch_id, product_id) values (p_destination_branch_id, v_item.product_id) on conflict (branch_id, product_id) do nothing;
    select on_hand into v_before from public.stock_balances where branch_id = p_destination_branch_id and product_id = v_item.product_id for update;
    v_after := v_before + v_item.base_quantity_shipped;
    update public.stock_balances set on_hand = v_after, updated_at = now() where branch_id = p_destination_branch_id and product_id = v_item.product_id;
    update public.stock_transfer_items set quantity_received = quantity_shipped where id = v_item.id;
    insert into public.stock_movements(branch_id, product_id, movement_type, quantity_before, quantity_delta, quantity_after, reference_type, reference_id, performed_by_user_id)
    values (p_destination_branch_id, v_item.product_id, 'transfer_in', v_before, v_item.base_quantity_shipped, v_after, 'stock_transfer', p_transfer_id, p_user_id);
  end loop;
  update public.stock_transfers set status = 'received', received_by_user_id = p_user_id, received_at = now(), updated_at = now() where id = p_transfer_id;
  insert into public.commerce_audit_logs(actor_user_id, branch_id, action, entity_type, entity_id) values (p_user_id, p_destination_branch_id, 'transfer.received', 'stock_transfer', p_transfer_id);
  return jsonb_build_object('transfer_id', p_transfer_id, 'status', 'received');
end; $$;

revoke all on function public.commerce_next_transfer_number(uuid) from public, anon, authenticated;
revoke all on function public.commerce_ship_stock_transfer(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.commerce_receive_stock_transfer(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.commerce_next_transfer_number(uuid) to service_role;
grant execute on function public.commerce_ship_stock_transfer(uuid, uuid, uuid) to service_role;
grant execute on function public.commerce_receive_stock_transfer(uuid, uuid, uuid) to service_role;
