-- Commerce tables are accessed only through authenticated Next.js route handlers
-- using the server service role. Keep an explicit deny policy as defence in depth.

drop function if exists private.can_operate_commerce_branch(uuid);

create policy commerce_server_only on public.product_categories for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.products for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.product_units for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.product_prices for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.customers for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.stock_balances for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.pos_register_sessions for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.commerce_document_counters for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.sales for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.sale_items for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.payments for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.stock_movements for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.commerce_audit_logs for all to authenticated using (false) with check (false);

create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_created_by_idx on public.products(created_by);
create index if not exists product_prices_branch_id_idx on public.product_prices(branch_id);
create index if not exists product_prices_product_unit_id_idx on public.product_prices(product_unit_id);
create index if not exists pos_register_sessions_opened_by_idx on public.pos_register_sessions(opened_by_user_id);
create index if not exists pos_register_sessions_closed_by_idx on public.pos_register_sessions(closed_by_user_id);
create index if not exists payments_received_by_idx on public.payments(received_by_user_id);
create index if not exists commerce_audit_logs_actor_idx on public.commerce_audit_logs(actor_user_id, created_at desc);
create index if not exists commerce_audit_logs_branch_idx on public.commerce_audit_logs(branch_id, created_at desc);
