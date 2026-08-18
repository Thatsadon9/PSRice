-- Speed up contains-search for the catalog fields used by backoffice.
create extension if not exists pg_trgm with schema extensions;

create index if not exists products_name_search_trgm_idx
  on public.products using gin (name extensions.gin_trgm_ops);

create index if not exists products_sku_search_trgm_idx
  on public.products using gin (sku extensions.gin_trgm_ops);

create index if not exists products_barcode_search_trgm_idx
  on public.products using gin (barcode extensions.gin_trgm_ops);

create index if not exists products_brand_search_trgm_idx
  on public.products using gin (brand extensions.gin_trgm_ops);
