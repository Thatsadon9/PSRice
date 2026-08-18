-- Separate physical stock by product unit while keeping the existing base stock
-- balance as the normalized aggregate used by reports and legacy flows.

alter table public.products
  add column if not exists unit_inventory_mode text not null default 'shared_base';

do $$
begin
  alter table public.products
    add constraint products_unit_inventory_mode_check
    check (unit_inventory_mode in ('shared_base', 'separate_unit'));
exception when duplicate_object then null;
end $$;

alter table public.product_units
  add column if not exists can_sell boolean not null default true,
  add column if not exists can_receive boolean not null default true;

create table if not exists public.stock_unit_balances (
  branch_id uuid not null references public.branches(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_unit_id uuid not null references public.product_units(id) on delete restrict,
  on_hand numeric(18,3) not null default 0 check (on_hand >= 0),
  reserved numeric(18,3) not null default 0 check (reserved >= 0),
  damaged numeric(18,3) not null default 0 check (damaged >= 0),
  in_transit numeric(18,3) not null default 0 check (in_transit >= 0),
  updated_at timestamptz not null default now(),
  primary key (branch_id, product_unit_id),
  unique (branch_id, product_id, product_unit_id)
);

create index if not exists stock_unit_balances_product_idx
  on public.stock_unit_balances(branch_id, product_id);

create table if not exists public.stock_unit_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_unit_id uuid not null references public.product_units(id) on delete restrict,
  movement_type text not null check (movement_type in ('opening', 'receive', 'sale', 'return', 'transfer_in', 'transfer_out', 'unit_conversion_in', 'unit_conversion_out', 'adjustment_in', 'adjustment_out', 'damage', 'expired', 'internal_use')),
  quantity_before numeric(18,3) not null,
  quantity_delta numeric(18,3) not null check (quantity_delta <> 0),
  quantity_after numeric(18,3) not null check (quantity_after >= 0),
  base_quantity_delta numeric(18,3) not null,
  reference_type text not null,
  reference_id uuid,
  note text,
  performed_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists stock_unit_movements_lookup_idx
  on public.stock_unit_movements(branch_id, product_id, product_unit_id, created_at desc);

create table if not exists public.inventory_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  source_unit_id uuid not null references public.product_units(id) on delete restrict,
  source_quantity numeric(18,3) not null check (source_quantity > 0),
  target_unit_id uuid not null references public.product_units(id) on delete restrict,
  target_quantity numeric(18,3) not null check (target_quantity > 0),
  base_quantity numeric(18,3) not null check (base_quantity > 0),
  note text,
  performed_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (source_unit_id <> target_unit_id)
);

create index if not exists inventory_unit_conversions_lookup_idx
  on public.inventory_unit_conversions(branch_id, product_id, created_at desc);

alter table public.stock_unit_balances enable row level security;
alter table public.stock_unit_movements enable row level security;
alter table public.inventory_unit_conversions enable row level security;
revoke all on table public.stock_unit_balances, public.stock_unit_movements, public.inventory_unit_conversions from anon, authenticated;
grant all privileges on table public.stock_unit_balances, public.stock_unit_movements, public.inventory_unit_conversions to service_role;
drop policy if exists commerce_server_only on public.stock_unit_balances;
create policy commerce_server_only on public.stock_unit_balances for all to authenticated using (false) with check (false);
drop policy if exists commerce_server_only on public.stock_unit_movements;
create policy commerce_server_only on public.stock_unit_movements for all to authenticated using (false) with check (false);
drop policy if exists commerce_server_only on public.inventory_unit_conversions;
create policy commerce_server_only on public.inventory_unit_conversions for all to authenticated using (false) with check (false);

create or replace function public.commerce_rebuild_product_stock(p_branch_id uuid, p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_on_hand numeric(18,3);
  v_reserved numeric(18,3);
  v_damaged numeric(18,3);
  v_in_transit numeric(18,3);
begin
  select
    round(coalesce(sum(s.on_hand * pu.conversion_to_base), 0), 3),
    round(coalesce(sum(s.reserved * pu.conversion_to_base), 0), 3),
    round(coalesce(sum(s.damaged * pu.conversion_to_base), 0), 3),
    round(coalesce(sum(s.in_transit * pu.conversion_to_base), 0), 3)
  into v_on_hand, v_reserved, v_damaged, v_in_transit
  from public.stock_unit_balances s
  join public.product_units pu on pu.id = s.product_unit_id and pu.product_id = p_product_id
  where s.branch_id = p_branch_id and s.product_id = p_product_id;

  insert into public.stock_balances(branch_id, product_id, on_hand, reserved, damaged, in_transit)
  values (p_branch_id, p_product_id, v_on_hand, v_reserved, v_damaged, v_in_transit)
  on conflict (branch_id, product_id) do update set
    on_hand = excluded.on_hand,
    reserved = excluded.reserved,
    damaged = excluded.damaged,
    in_transit = excluded.in_transit,
    updated_at = now();
end;
$$;

revoke all on function public.commerce_rebuild_product_stock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.commerce_rebuild_product_stock(uuid, uuid) to service_role;

create or replace function public.commerce_enable_product_unit_inventory(
  p_user_id uuid,
  p_product_id uuid,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_default_unit public.product_units%rowtype;
  v_branch record;
  v_balance public.stock_balances%rowtype;
begin
  if p_mode not in ('shared_base', 'separate_unit') then
    raise exception 'invalid unit inventory mode' using errcode = '22023';
  end if;
  if not exists (select 1 from public.users where id = p_user_id and status = 'active'::public.user_status and role in ('admin'::public.user_role, 'manager'::public.user_role)) then
    raise exception 'inventory mode access denied' using errcode = '42501';
  end if;
  select * into v_default_unit from public.product_units where product_id = p_product_id and is_default for update;
  if not found then raise exception 'default product unit not found' using errcode = '22023'; end if;

  update public.products set unit_inventory_mode = p_mode, updated_at = now() where id = p_product_id;
  if p_mode = 'separate_unit' then
    for v_branch in select id from public.branches where is_active loop
      select * into v_balance from public.stock_balances where branch_id = v_branch.id and product_id = p_product_id;
      insert into public.stock_unit_balances(branch_id, product_id, product_unit_id, on_hand, reserved, damaged, in_transit)
      values (
        v_branch.id, p_product_id, v_default_unit.id,
        coalesce(v_balance.on_hand, 0) / v_default_unit.conversion_to_base,
        coalesce(v_balance.reserved, 0) / v_default_unit.conversion_to_base,
        coalesce(v_balance.damaged, 0) / v_default_unit.conversion_to_base,
        coalesce(v_balance.in_transit, 0) / v_default_unit.conversion_to_base
      )
      on conflict (branch_id, product_unit_id) do nothing;
      perform public.commerce_rebuild_product_stock(v_branch.id, p_product_id);
    end loop;
  end if;
  return jsonb_build_object('product_id', p_product_id, 'unit_inventory_mode', p_mode);
end;
$$;

revoke all on function public.commerce_enable_product_unit_inventory(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.commerce_enable_product_unit_inventory(uuid, uuid, text) to service_role;

create or replace function public.commerce_adjust_stock_unit(
  p_user_id uuid,
  p_branch_id uuid,
  p_product_id uuid,
  p_product_unit_id uuid,
  p_quantity_after numeric,
  p_reason text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_balance public.stock_unit_balances%rowtype;
  v_delta numeric(18,3);
  v_movement_type text;
begin
  if not public.commerce_has_permission(p_user_id, 'inventory.adjust', p_branch_id) then raise exception 'stock adjustment access denied' using errcode = '42501'; end if;
  if p_quantity_after < 0 or coalesce(trim(p_reason), '') = '' then raise exception 'invalid stock unit adjustment' using errcode = '22023'; end if;
  select * into v_product from public.products where id = p_product_id and unit_inventory_mode = 'separate_unit' for update;
  if not found then raise exception 'product does not use separate unit inventory' using errcode = '22023'; end if;
  select * into v_unit from public.product_units where id = p_product_unit_id and product_id = p_product_id;
  if not found then raise exception 'product unit not found' using errcode = '22023'; end if;
  insert into public.stock_unit_balances(branch_id, product_id, product_unit_id) values (p_branch_id, p_product_id, p_product_unit_id) on conflict (branch_id, product_unit_id) do nothing;
  select * into v_balance from public.stock_unit_balances where branch_id = p_branch_id and product_unit_id = p_product_unit_id for update;
  if p_quantity_after < v_balance.reserved + v_balance.damaged then raise exception 'unit stock cannot be lower than reserved or damaged stock' using errcode = '22023'; end if;
  v_delta := round(p_quantity_after - v_balance.on_hand, 3);
  if v_delta = 0 then raise exception 'no stock difference' using errcode = '22023'; end if;
  v_movement_type := case when v_delta > 0 then 'adjustment_in' else 'adjustment_out' end;
  update public.stock_unit_balances set on_hand = p_quantity_after, updated_at = now() where branch_id = p_branch_id and product_unit_id = p_product_unit_id;
  insert into public.stock_unit_movements(branch_id, product_id, product_unit_id, movement_type, quantity_before, quantity_delta, quantity_after, base_quantity_delta, reference_type, note, performed_by_user_id)
  values (p_branch_id, p_product_id, p_product_unit_id, v_movement_type, v_balance.on_hand, v_delta, p_quantity_after, round(v_delta * v_unit.conversion_to_base, 3), 'stock_unit_adjustment', nullif(trim(p_note), ''), p_user_id);
  perform public.commerce_rebuild_product_stock(p_branch_id, p_product_id);
  return jsonb_build_object('product_id', p_product_id, 'product_unit_id', p_product_unit_id, 'quantity_after', p_quantity_after, 'quantity_delta', v_delta);
end;
$$;

revoke all on function public.commerce_adjust_stock_unit(uuid, uuid, uuid, uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.commerce_adjust_stock_unit(uuid, uuid, uuid, uuid, numeric, text, text) to service_role;

create or replace function public.commerce_convert_stock_units(
  p_user_id uuid,
  p_branch_id uuid,
  p_product_id uuid,
  p_source_unit_id uuid,
  p_source_quantity numeric,
  p_target_unit_id uuid,
  p_target_quantity numeric default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_source public.product_units%rowtype;
  v_target public.product_units%rowtype;
  v_source_balance public.stock_unit_balances%rowtype;
  v_target_balance public.stock_unit_balances%rowtype;
  v_target_quantity numeric(18,3);
  v_base_quantity numeric(18,3);
  v_source_after numeric(18,3);
  v_target_after numeric(18,3);
  v_conversion_id uuid;
begin
  if not public.commerce_has_permission(p_user_id, 'inventory.adjust', p_branch_id) then raise exception 'unit conversion access denied' using errcode = '42501'; end if;
  if p_source_quantity <= 0 or p_source_unit_id = p_target_unit_id then raise exception 'invalid unit conversion' using errcode = '22023'; end if;
  select * into v_product from public.products where id = p_product_id and unit_inventory_mode = 'separate_unit' for update;
  if not found then raise exception 'product does not use separate unit inventory' using errcode = '22023'; end if;
  select * into v_source from public.product_units where id = p_source_unit_id and product_id = p_product_id;
  select * into v_target from public.product_units where id = p_target_unit_id and product_id = p_product_id;
  if not found or v_source.id is null or v_target.id is null then raise exception 'product unit not found' using errcode = '22023'; end if;
  v_target_quantity := round(coalesce(p_target_quantity, p_source_quantity * v_source.conversion_to_base / v_target.conversion_to_base), 3);
  v_base_quantity := round(p_source_quantity * v_source.conversion_to_base, 3);
  if v_target_quantity <= 0 or abs(v_base_quantity - round(v_target_quantity * v_target.conversion_to_base, 3)) > 0.001 then raise exception 'unit conversion quantity is not exact' using errcode = '22023'; end if;

  insert into public.stock_unit_balances(branch_id, product_id, product_unit_id) values (p_branch_id, p_product_id, p_source_unit_id) on conflict (branch_id, product_unit_id) do nothing;
  insert into public.stock_unit_balances(branch_id, product_id, product_unit_id) values (p_branch_id, p_product_id, p_target_unit_id) on conflict (branch_id, product_unit_id) do nothing;
  select * into v_source_balance from public.stock_unit_balances where branch_id = p_branch_id and product_unit_id = p_source_unit_id for update;
  select * into v_target_balance from public.stock_unit_balances where branch_id = p_branch_id and product_unit_id = p_target_unit_id for update;
  if v_source_balance.on_hand - v_source_balance.reserved - v_source_balance.damaged < p_source_quantity then raise exception 'insufficient source unit stock' using errcode = '22023'; end if;
  v_source_after := round(v_source_balance.on_hand - p_source_quantity, 3);
  v_target_after := round(v_target_balance.on_hand + v_target_quantity, 3);
  update public.stock_unit_balances set on_hand = v_source_after, updated_at = now() where branch_id = p_branch_id and product_unit_id = p_source_unit_id;
  update public.stock_unit_balances set on_hand = v_target_after, updated_at = now() where branch_id = p_branch_id and product_unit_id = p_target_unit_id;
  insert into public.inventory_unit_conversions(branch_id, product_id, source_unit_id, source_quantity, target_unit_id, target_quantity, base_quantity, note, performed_by_user_id)
  values (p_branch_id, p_product_id, p_source_unit_id, p_source_quantity, p_target_unit_id, v_target_quantity, v_base_quantity, nullif(trim(p_note), ''), p_user_id) returning id into v_conversion_id;
  insert into public.stock_unit_movements(branch_id, product_id, product_unit_id, movement_type, quantity_before, quantity_delta, quantity_after, base_quantity_delta, reference_type, reference_id, note, performed_by_user_id)
  values
    (p_branch_id, p_product_id, p_source_unit_id, 'unit_conversion_out', v_source_balance.on_hand, -p_source_quantity, v_source_after, -v_base_quantity, 'unit_conversion', v_conversion_id, nullif(trim(p_note), ''), p_user_id),
    (p_branch_id, p_product_id, p_target_unit_id, 'unit_conversion_in', v_target_balance.on_hand, v_target_quantity, v_target_after, v_base_quantity, 'unit_conversion', v_conversion_id, nullif(trim(p_note), ''), p_user_id);
  perform public.commerce_rebuild_product_stock(p_branch_id, p_product_id);
  return jsonb_build_object('conversion_id', v_conversion_id, 'source_quantity', p_source_quantity, 'target_quantity', v_target_quantity, 'base_quantity', v_base_quantity);
end;
$$;

revoke all on function public.commerce_convert_stock_units(uuid, uuid, uuid, uuid, numeric, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.commerce_convert_stock_units(uuid, uuid, uuid, uuid, numeric, uuid, numeric, text) to service_role;

create or replace function private.commerce_sync_sale_unit_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_mode text; v_balance public.stock_unit_balances%rowtype; v_unit public.product_units%rowtype; v_after numeric(18,3);
begin
  select unit_inventory_mode into v_mode from public.products where id = new.product_id;
  if v_mode <> 'separate_unit' then return new; end if;
  select * into v_unit from public.product_units where id = new.product_unit_id and product_id = new.product_id;
  insert into public.stock_unit_balances(branch_id, product_id, product_unit_id) select s.branch_id, new.product_id, new.product_unit_id from public.sales s where s.id = new.sale_id on conflict (branch_id, product_unit_id) do nothing;
  select b.* into v_balance from public.stock_unit_balances b join public.sales s on s.branch_id = b.branch_id where s.id = new.sale_id and b.product_unit_id = new.product_unit_id for update;
  if v_balance.on_hand - v_balance.reserved - v_balance.damaged < new.quantity then raise exception 'insufficient stock for product unit %', new.unit_name_snapshot using errcode = '22023'; end if;
  v_after := round(v_balance.on_hand - new.quantity, 3);
  update public.stock_unit_balances set on_hand = v_after, updated_at = now() where branch_id = (select branch_id from public.sales where id = new.sale_id) and product_unit_id = new.product_unit_id;
  insert into public.stock_unit_movements(branch_id, product_id, product_unit_id, movement_type, quantity_before, quantity_delta, quantity_after, base_quantity_delta, reference_type, reference_id, performed_by_user_id)
  select s.branch_id, new.product_id, new.product_unit_id, 'sale', v_balance.on_hand, -new.quantity, v_after, -new.base_quantity, 'sale', new.sale_id, s.performed_by_user_id from public.sales s where s.id = new.sale_id;
  return new;
end; $$;

drop trigger if exists sale_items_sync_unit_stock on public.sale_items;
create trigger sale_items_sync_unit_stock after insert on public.sale_items for each row execute function private.commerce_sync_sale_unit_stock();

create or replace function private.commerce_sync_receipt_unit_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_mode text; v_balance public.stock_unit_balances%rowtype; v_unit public.product_units%rowtype; v_after numeric(18,3); v_branch uuid; v_user uuid;
begin
  select p.unit_inventory_mode into v_mode from public.products p where p.id = new.product_id;
  if v_mode <> 'separate_unit' then return new; end if;
  select gr.branch_id, gr.received_by_user_id into v_branch, v_user from public.goods_receipts gr where gr.id = new.goods_receipt_id;
  select * into v_unit from public.product_units where id = new.product_unit_id and product_id = new.product_id;
  insert into public.stock_unit_balances(branch_id, product_id, product_unit_id) values (v_branch, new.product_id, new.product_unit_id) on conflict (branch_id, product_unit_id) do nothing;
  select * into v_balance from public.stock_unit_balances where branch_id = v_branch and product_unit_id = new.product_unit_id for update;
  v_after := round(v_balance.on_hand + new.quantity, 3);
  update public.stock_unit_balances set on_hand = v_after, updated_at = now() where branch_id = v_branch and product_unit_id = new.product_unit_id;
  insert into public.stock_unit_movements(branch_id, product_id, product_unit_id, movement_type, quantity_before, quantity_delta, quantity_after, base_quantity_delta, reference_type, reference_id, performed_by_user_id)
  values (v_branch, new.product_id, new.product_unit_id, 'receive', v_balance.on_hand, new.quantity, v_after, new.base_quantity, 'goods_receipt', new.goods_receipt_id, v_user);
  return new;
end; $$;

drop trigger if exists goods_receipt_items_sync_unit_stock on public.goods_receipt_items;
create trigger goods_receipt_items_sync_unit_stock after insert on public.goods_receipt_items for each row execute function private.commerce_sync_receipt_unit_stock();

create or replace function public.set_stock_unit_balance_updated_at()
returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists stock_unit_balances_set_updated_at on public.stock_unit_balances;
create trigger stock_unit_balances_set_updated_at before update on public.stock_unit_balances for each row execute function public.set_stock_unit_balance_updated_at();
