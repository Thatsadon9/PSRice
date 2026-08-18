create index if not exists branch_product_availability_updated_by_user_id_idx
  on public.branch_product_availability(updated_by_user_id)
  where updated_by_user_id is not null;
