-- Explicit deny policy documents that this queue is intentionally service-role only.
drop policy if exists storage_cleanup_jobs_server_only on public.storage_cleanup_jobs;
create policy storage_cleanup_jobs_server_only on public.storage_cleanup_jobs
for all to authenticated using (false) with check (false);

-- Cover foreign keys used by operational joins and cleanup checks.
create index if not exists accounts_payable_branch_idx on public.accounts_payable(branch_id);
create index if not exists accounts_payable_purchase_order_idx on public.accounts_payable(purchase_order_id) where purchase_order_id is not null;
create index if not exists app_error_events_branch_time_idx on public.app_error_events(branch_id, occurred_at desc) where branch_id is not null;
create index if not exists app_error_events_user_time_idx on public.app_error_events(user_id, occurred_at desc) where user_id is not null;
create index if not exists app_error_events_terminal_time_idx on public.app_error_events(terminal_id, occurred_at desc) where terminal_id is not null;
create index if not exists cash_movements_branch_time_idx on public.cash_movements(branch_id, created_at desc);
create index if not exists cash_movements_actor_idx on public.cash_movements(performed_by_user_id);
create index if not exists cash_movements_approver_idx on public.cash_movements(approved_by_user_id) where approved_by_user_id is not null;
create index if not exists commerce_preferences_branch_idx on public.commerce_user_preferences(last_branch_id) where last_branch_id is not null;
create index if not exists commerce_preferences_terminal_idx on public.commerce_user_preferences(last_terminal_id) where last_terminal_id is not null;
create index if not exists commission_withdrawals_customer_idx on public.commission_withdrawals(customer_id);
create index if not exists commission_withdrawals_user_idx on public.commission_withdrawals(user_id) where user_id is not null;
create index if not exists commission_withdrawals_approver_idx on public.commission_withdrawals(approved_by_user_id) where approved_by_user_id is not null;
create index if not exists coupons_promotion_idx on public.coupons(promotion_id);
create index if not exists coupons_customer_idx on public.coupons(customer_id) where customer_id is not null;
create index if not exists customer_credit_branch_time_idx on public.customer_credit_transactions(branch_id, created_at desc);
create index if not exists customer_credit_actor_idx on public.customer_credit_transactions(performed_by_user_id) where performed_by_user_id is not null;
create index if not exists customers_tier_idx on public.customers(customer_tier_id) where customer_tier_id is not null;
create index if not exists daily_closings_submitter_idx on public.daily_closings(submitted_by_user_id) where submitted_by_user_id is not null;
create index if not exists daily_closings_approver_idx on public.daily_closings(approved_by_user_id) where approved_by_user_id is not null;
create index if not exists legacy_transactions_customer_idx on public.legacy_transactions(customer_id, transaction_at desc) where customer_id is not null;
create index if not exists manager_approvals_terminal_idx on public.manager_approvals(terminal_id) where terminal_id is not null;
create index if not exists manager_approvals_requester_idx on public.manager_approvals(requested_by_user_id, created_at desc);
create index if not exists manager_approvals_approver_idx on public.manager_approvals(approved_by_user_id, created_at desc) where approved_by_user_id is not null;
create index if not exists migration_batches_actor_idx on public.migration_batches(created_by_user_id, created_at desc);
create index if not exists pos_terminals_creator_idx on public.pos_terminals(created_by_user_id) where created_by_user_id is not null;
create index if not exists product_barcodes_unit_idx on public.product_barcodes(product_unit_id) where product_unit_id is not null;
create index if not exists promotions_creator_idx on public.promotions(created_by_user_id) where created_by_user_id is not null;
create index if not exists purchase_requests_branch_status_idx on public.purchase_requests(branch_id, status, created_at desc);
create index if not exists purchase_requests_requester_idx on public.purchase_requests(requested_by_user_id, created_at desc);
create index if not exists purchase_requests_approver_idx on public.purchase_requests(approved_by_user_id) where approved_by_user_id is not null;
create index if not exists stock_count_sessions_branch_status_idx on public.stock_count_sessions(branch_id, status, created_at desc);
create index if not exists stock_count_sessions_actor_idx on public.stock_count_sessions(started_by_user_id, created_at desc);
create index if not exists stock_count_items_product_idx on public.stock_count_items(product_id);
create index if not exists stock_lots_product_idx on public.stock_lots(product_id);
create index if not exists supplier_returns_branch_status_idx on public.supplier_returns(branch_id, status, created_at desc);
create index if not exists supplier_returns_supplier_idx on public.supplier_returns(supplier_id, created_at desc);
create index if not exists stock_transfer_events_actor_idx on public.stock_transfer_events(performed_by_user_id);
