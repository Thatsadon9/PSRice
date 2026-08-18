-- Cover operational foreign keys reported by the database advisor.
create index if not exists held_sales_register_session_idx on public.held_sales(register_session_id);
create index if not exists held_sales_customer_idx on public.held_sales(customer_id);
create index if not exists held_sales_recalled_by_idx on public.held_sales(recalled_by_user_id);
create index if not exists sale_returns_register_session_idx on public.sale_returns(register_session_id);
create index if not exists sale_returns_customer_idx on public.sale_returns(customer_id);
create index if not exists sale_return_items_product_idx on public.sale_return_items(product_id);
create index if not exists sale_return_items_product_unit_idx on public.sale_return_items(product_unit_id);
create index if not exists return_refunds_refunded_by_idx on public.return_refunds(refunded_by_user_id);
create index if not exists sales_register_session_idx on public.sales(register_session_id);
create index if not exists sale_items_product_unit_idx on public.sale_items(product_unit_id);
create index if not exists stock_movements_product_idx on public.stock_movements(product_id);
create index if not exists stock_movements_performed_by_idx on public.stock_movements(performed_by_user_id);
