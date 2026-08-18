-- Branch product availability is intentionally sparse. A product is available
-- to sell in every branch by default; this table stores only per-branch
-- exceptions, so adding a product never requires repeating work per branch.

create table if not exists public.branch_product_availability (
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  is_active boolean not null default false,
  updated_by_user_id uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (branch_id, product_id)
);

comment on table public.branch_product_availability is
  'Sparse per-branch sales-catalog exceptions. Missing row means the active product is sellable in that branch.';

create index if not exists branch_product_availability_product_id_idx
  on public.branch_product_availability(product_id);

drop trigger if exists branch_product_availability_set_updated_at on public.branch_product_availability;
create trigger branch_product_availability_set_updated_at
before update on public.branch_product_availability
for each row execute function public.set_updated_at_timestamp();

alter table public.branch_product_availability enable row level security;
revoke all on public.branch_product_availability from anon, authenticated;
grant all on public.branch_product_availability to service_role;
drop policy if exists commerce_server_only on public.branch_product_availability;
create policy commerce_server_only on public.branch_product_availability
  for all to authenticated using (false) with check (false);

-- Enforce the branch catalog at the transaction boundary as well as in the UI.
-- Keep the later customer-price amendment to commerce_finalize_pos_sale intact
-- by patching its current function definition rather than recreating an older copy.
do $$
declare
  v_definition text;
  v_before text := '    where p.id = v_product_id' || chr(10) || '      and p.is_active;';
  v_after text := '    where p.id = v_product_id' || chr(10) || '      and p.is_active' || chr(10) ||
    '      and not exists (' || chr(10) ||
    '        select 1' || chr(10) ||
    '        from public.branch_product_availability bpa' || chr(10) ||
    '        where bpa.branch_id = p_branch_id' || chr(10) ||
    '          and bpa.product_id = p.id' || chr(10) ||
    '          and bpa.is_active = false' || chr(10) ||
    '      );';
begin
  select pg_get_functiondef('public.commerce_finalize_pos_sale(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,text)'::regprocedure)
  into v_definition;

  if position('branch_product_availability' in v_definition) = 0 then
    if position(v_before in v_definition) = 0 then
      raise exception 'Could not apply branch availability check to commerce_finalize_pos_sale';
    end if;
    execute replace(v_definition, v_before, v_after);
  end if;
end $$;

revoke all on function public.commerce_finalize_pos_sale(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.commerce_finalize_pos_sale(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,text) to service_role;

-- The public shop uses the same catalog rule when its order is collected from
-- a selected branch, preventing a direct request from bypassing the storefront.
do $$
declare
  v_definition text;
  v_before text := '    select * into v_product from public.products where id = v_product_id and is_active = true;';
  v_after text := '    select * into v_product from public.products' || chr(10) ||
    '    where id = v_product_id and is_active = true' || chr(10) ||
    '      and not exists (' || chr(10) ||
    '        select 1 from public.branch_product_availability bpa' || chr(10) ||
    '        where bpa.branch_id = p_branch_id and bpa.product_id = v_product_id and bpa.is_active = false' || chr(10) ||
    '      );';
begin
  select pg_get_functiondef('public.commerce_create_online_order(uuid,text,text,text,text,text,text,jsonb,text)'::regprocedure)
  into v_definition;

  if position('branch_product_availability' in v_definition) = 0 then
    if position(v_before in v_definition) = 0 then
      raise exception 'Could not apply branch availability check to commerce_create_online_order';
    end if;
    execute replace(v_definition, v_before, v_after);
  end if;
end $$;

revoke all on function public.commerce_create_online_order(uuid,text,text,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.commerce_create_online_order(uuid,text,text,text,text,text,text,jsonb,text) to service_role;
