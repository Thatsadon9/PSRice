-- Product master configuration used by the Products & Services workspace.
-- Stock quantities and branch availability remain in their dedicated tables.

alter table public.products
  add column if not exists track_inventory boolean not null default true,
  add column if not exists is_weighted boolean not null default false,
  add column if not exists allow_branch_price boolean not null default false,
  add column if not exists weight_kg numeric(12,3),
  add column if not exists area_sqm numeric(12,3);

alter table public.products
  drop constraint if exists products_weight_kg_nonnegative,
  add constraint products_weight_kg_nonnegative
    check (weight_kg is null or weight_kg >= 0),
  drop constraint if exists products_area_sqm_nonnegative,
  add constraint products_area_sqm_nonnegative
    check (area_sqm is null or area_sqm >= 0);

comment on column public.products.track_inventory is
  'Whether sales and receiving should affect stock quantities for this product.';
comment on column public.products.is_weighted is
  'Whether the POS accepts decimal quantities, for example kilograms.';
comment on column public.products.allow_branch_price is
  'Whether branch managers may override the central default price.';
comment on column public.products.weight_kg is
  'Optional physical weight of one base unit in kilograms.';
comment on column public.products.area_sqm is
  'Optional coverage or area of one base unit in square metres.';
