-- The catalog list is sorted and paginated on these columns for every backoffice visit.
create index if not exists products_catalog_updated_idx
  on public.products (updated_at desc, id);

create index if not exists products_catalog_name_idx
  on public.products (name, id);

create index if not exists products_catalog_active_updated_idx
  on public.products (is_active, updated_at desc, id);
