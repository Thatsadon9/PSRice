-- POSVis seamless migration foundation.
-- This migration is additive: existing Commerce transactions remain untouched.

alter table public.branches add column if not exists code text;
alter table public.branches add column if not exists external_ref text;
create unique index if not exists branches_code_unique_idx on public.branches(code) where code is not null;
create unique index if not exists branches_external_ref_unique_idx on public.branches(external_ref) where external_ref is not null;

alter table public.products add column if not exists brand text;
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists tax_rate numeric(6,3) not null default 0 check (tax_rate >= 0 and tax_rate <= 100);
alter table public.products add column if not exists external_ref text;
alter table public.products add column if not exists image_is_permanent boolean not null default true;
create unique index if not exists products_external_ref_unique_idx on public.products(external_ref) where external_ref is not null;

alter table public.customers add column if not exists external_ref text;
alter table public.customers add column if not exists credit_balance numeric(14,2) not null default 0 check (credit_balance >= 0);
alter table public.suppliers add column if not exists external_ref text;
alter table public.suppliers add column if not exists payment_terms_days integer not null default 0 check (payment_terms_days >= 0);
create unique index if not exists customers_external_ref_unique_idx on public.customers(external_ref) where external_ref is not null;
create unique index if not exists suppliers_external_ref_unique_idx on public.suppliers(external_ref) where external_ref is not null;

alter table public.stock_balances add column if not exists in_transit numeric(18,3) not null default 0 check (in_transit >= 0);
alter table public.sales add column if not exists external_ref text;
alter table public.sales add column if not exists legacy_read_only boolean not null default false;
alter table public.sales add column if not exists void_reason text;
alter table public.sales add column if not exists voided_by_user_id uuid references public.users(id) on delete restrict;
alter table public.sales add column if not exists voided_at timestamptz;
create unique index if not exists sales_external_ref_unique_idx on public.sales(external_ref) where external_ref is not null;

alter table public.sale_items add column if not exists price_reason text;
alter table public.sale_items add column if not exists discount_reason text;
alter table public.pos_register_sessions add column if not exists terminal_id uuid;
alter table public.pos_register_sessions add column if not exists variance_approved_by_user_id uuid references public.users(id) on delete restrict;
alter table public.pos_register_sessions add column if not exists variance_approved_at timestamptz;

create table if not exists public.commerce_user_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  last_branch_id uuid references public.branches(id) on delete set null,
  last_terminal_id uuid,
  sidebar_collapsed boolean not null default false,
  shortcuts jsonb not null default '{"payment":"F9","fullscreen":"F11"}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pos_terminals (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null,
  name text not null,
  printer_name text,
  receipt_width_mm integer not null default 80 check (receipt_width_mm in (58, 80)),
  cash_drawer_enabled boolean not null default false,
  local_bridge_enabled boolean not null default false,
  pairing_token_hash text,
  last_seen_at timestamptz,
  is_active boolean not null default true,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, code)
);

alter table public.commerce_user_preferences
  drop constraint if exists commerce_user_preferences_last_terminal_id_fkey;
alter table public.commerce_user_preferences
  add constraint commerce_user_preferences_last_terminal_id_fkey foreign key (last_terminal_id) references public.pos_terminals(id) on delete set null;
alter table public.pos_register_sessions
  drop constraint if exists pos_register_sessions_terminal_id_fkey;
alter table public.pos_register_sessions
  add constraint pos_register_sessions_terminal_id_fkey foreign key (terminal_id) references public.pos_terminals(id) on delete restrict;

create table if not exists public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  product_unit_id uuid references public.product_units(id) on delete cascade,
  barcode text not null unique,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists product_barcodes_product_idx on public.product_barcodes(product_id);

create table if not exists public.product_favorite_groups (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (branch_id is not null or user_id is not null)
);

create table if not exists public.product_favorite_items (
  group_id uuid not null references public.product_favorite_groups(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (group_id, product_id)
);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  register_session_id uuid not null references public.pos_register_sessions(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  movement_type text not null check (movement_type in ('cash_in', 'cash_out', 'expense', 'drop')),
  amount numeric(14,2) not null check (amount > 0),
  reason text not null,
  reference_type text,
  reference_id uuid,
  performed_by_user_id uuid not null references public.users(id) on delete restrict,
  approved_by_user_id uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists cash_movements_session_idx on public.cash_movements(register_session_id, created_at desc);

create table if not exists public.daily_closings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  business_date date not null,
  payment_totals jsonb not null default '{}'::jsonb,
  counted_cash numeric(14,2) not null default 0,
  expected_cash numeric(14,2) not null default 0,
  cash_variance numeric(14,2) generated always as (counted_cash - expected_cash) stored,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'locked')),
  submitted_by_user_id uuid references public.users(id) on delete restrict,
  approved_by_user_id uuid references public.users(id) on delete restrict,
  approved_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, business_date)
);

create table if not exists public.manager_approvals (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  terminal_id uuid references public.pos_terminals(id) on delete set null,
  requested_by_user_id uuid not null references public.users(id) on delete restrict,
  approved_by_user_id uuid references public.users(id) on delete restrict,
  action_code text not null,
  entity_type text,
  entity_id uuid,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  approved_at timestamptz,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now()
);

create table if not exists public.pos_manager_pins (
  user_id uuid not null references public.users(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  pin_salt text not null,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, branch_id)
);

create table if not exists public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  lot_number text not null,
  expires_on date,
  quantity_on_hand numeric(18,3) not null default 0 check (quantity_on_hand >= 0),
  quantity_damaged numeric(18,3) not null default 0 check (quantity_damaged >= 0),
  received_at timestamptz not null default now(),
  external_ref text,
  unique (branch_id, product_id, lot_number)
);
create index if not exists stock_lots_expiry_idx on public.stock_lots(branch_id, expires_on) where expires_on is not null;

create table if not exists public.stock_count_sessions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  count_number text not null unique,
  status text not null default 'draft' check (status in ('draft', 'counting', 'review', 'approved', 'posted', 'cancelled')),
  scope jsonb not null default '{}'::jsonb,
  started_by_user_id uuid not null references public.users(id) on delete restrict,
  approved_by_user_id uuid references public.users(id) on delete restrict,
  started_at timestamptz,
  approved_at timestamptz,
  posted_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_count_items (
  id uuid primary key default gen_random_uuid(),
  stock_count_session_id uuid not null references public.stock_count_sessions(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  system_quantity numeric(18,3) not null,
  counted_quantity numeric(18,3),
  variance numeric(18,3) generated always as (coalesce(counted_quantity, system_quantity) - system_quantity) stored,
  reason text,
  counted_by_user_id uuid references public.users(id) on delete restrict,
  counted_at timestamptz,
  unique (stock_count_session_id, product_id)
);

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique,
  branch_id uuid not null references public.branches(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'converted', 'cancelled')),
  requested_by_user_id uuid not null references public.users(id) on delete restrict,
  approved_by_user_id uuid references public.users(id) on delete restrict,
  required_on date,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_unit_id uuid not null references public.product_units(id) on delete restrict,
  quantity numeric(18,3) not null check (quantity > 0),
  note text,
  unique (purchase_request_id, product_id, product_unit_id)
);

create table if not exists public.supplier_returns (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  goods_receipt_id uuid references public.goods_receipts(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'approved', 'shipped', 'credited', 'cancelled')),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  reason text not null,
  created_by_user_id uuid not null references public.users(id) on delete restrict,
  approved_by_user_id uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders(id) on delete restrict,
  document_number text not null,
  amount numeric(14,2) not null check (amount >= 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  due_on date,
  status text not null default 'open' check (status in ('open', 'partially_paid', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, document_number),
  check (paid_amount <= amount)
);

alter table public.stock_transfers add column if not exists required_on date;
alter table public.stock_transfers add column if not exists reason text;
alter table public.stock_transfers add column if not exists carrier_name text;
alter table public.stock_transfers add column if not exists vehicle_registration text;
alter table public.stock_transfers add column if not exists attachment_urls jsonb not null default '[]'::jsonb;
alter table public.stock_transfer_items add column if not exists quantity_damaged numeric(18,3) not null default 0 check (quantity_damaged >= 0);

create table if not exists public.stock_transfer_events (
  id uuid primary key default gen_random_uuid(),
  stock_transfer_id uuid not null references public.stock_transfers(id) on delete restrict,
  event_type text not null check (event_type in ('requested', 'approved', 'picked', 'packed', 'shipped', 'partially_received', 'received', 'problem', 'cancelled')),
  quantities jsonb not null default '{}'::jsonb,
  note text,
  performed_by_user_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists stock_transfer_events_transfer_idx on public.stock_transfer_events(stock_transfer_id, created_at);

create table if not exists public.customer_tiers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  customer_type text not null check (customer_type in ('retail', 'member', 'wholesale', 'dealer')),
  minimum_spend numeric(14,2) not null default 0,
  points_multiplier numeric(8,3) not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customers add column if not exists customer_tier_id uuid references public.customer_tiers(id) on delete set null;

create table if not exists public.customer_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('charge', 'payment', 'adjustment', 'reversal')),
  amount numeric(14,2) not null check (amount <> 0),
  balance_after numeric(14,2) not null,
  reference_type text not null,
  reference_id uuid,
  note text,
  performed_by_user_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists customer_credit_transactions_customer_idx on public.customer_credit_transactions(customer_id, created_at desc);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  promotion_type text not null check (promotion_type in ('price', 'percentage', 'amount', 'free_item', 'coupon')),
  priority integer not null default 0,
  branch_ids uuid[] not null default '{}'::uuid[],
  customer_types text[] not null default '{}'::text[],
  conditions jsonb not null default '{}'::jsonb,
  benefits jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete restrict,
  code text not null unique,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  customer_id uuid references public.customers(id) on delete restrict,
  valid_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.product_prices add column if not exists promotion_id uuid references public.promotions(id) on delete cascade;
create index if not exists product_prices_promotion_idx on public.product_prices(promotion_id) where promotion_id is not null;

create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_type text not null check (trigger_type in ('referral', 'employee_sale', 'product', 'category')),
  calculation_type text not null check (calculation_type in ('fixed', 'percentage')),
  value numeric(14,4) not null check (value >= 0),
  conditions jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commission_withdrawals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete restrict,
  user_id uuid references public.users(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  approved_by_user_id uuid references public.users(id) on delete restrict,
  approved_at timestamptz,
  paid_at timestamptz,
  payment_reference text,
  note text,
  check ((customer_id is not null)::integer + (user_id is not null)::integer = 1)
);

create table if not exists public.migration_batches (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'posvis',
  file_name text not null,
  data_type text not null,
  checksum text not null,
  status text not null default 'uploaded' check (status in ('uploaded', 'validating', 'ready', 'importing', 'completed', 'failed', 'rolled_back')),
  dry_run boolean not null default true,
  row_count integer not null default 0,
  valid_count integer not null default 0,
  error_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_by_user_id uuid not null references public.users(id) on delete restrict,
  completed_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, checksum, data_type)
);

create table if not exists public.migration_rows (
  id uuid primary key default gen_random_uuid(),
  migration_batch_id uuid not null references public.migration_batches(id) on delete restrict,
  row_number integer not null,
  external_ref text,
  raw_data jsonb not null,
  normalized_data jsonb,
  status text not null default 'pending' check (status in ('pending', 'valid', 'warning', 'error', 'imported', 'skipped')),
  error_codes text[] not null default '{}'::text[],
  error_message text,
  imported_entity_type text,
  imported_entity_id uuid,
  created_at timestamptz not null default now(),
  unique (migration_batch_id, row_number)
);
create index if not exists migration_rows_batch_status_idx on public.migration_rows(migration_batch_id, status);

create table if not exists public.migration_id_map (
  source_system text not null default 'posvis',
  entity_type text not null,
  external_ref text not null,
  internal_id uuid not null,
  migration_batch_id uuid not null references public.migration_batches(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (source_system, entity_type, external_ref)
);

create table if not exists public.legacy_transactions (
  id uuid primary key default gen_random_uuid(),
  external_ref text not null unique,
  branch_id uuid not null references public.branches(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('sale', 'return', 'void', 'payment')),
  document_number text not null,
  transaction_at timestamptz not null,
  customer_id uuid references public.customers(id) on delete set null,
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  migration_batch_id uuid not null references public.migration_batches(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists legacy_transactions_reporting_idx on public.legacy_transactions(branch_id, transaction_at desc);

create table if not exists public.app_error_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null default 'error' check (severity in ('info', 'warning', 'error', 'critical')),
  user_id uuid references public.users(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  terminal_id uuid references public.pos_terminals(id) on delete set null,
  request_id text,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists app_error_events_type_time_idx on public.app_error_events(event_type, occurred_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/webp', 'image/jpeg', 'image/png']::text[])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into public.commerce_permissions(code, name, workspace, description) values
  ('pos.change_price', 'เปลี่ยนราคาหน้าขาย', 'pos', 'เปลี่ยนราคาต่อรายการในบิล'),
  ('pos.discount', 'ให้ส่วนลด', 'pos', 'ให้ส่วนลดต่อรายการหรือท้ายบิล'),
  ('pos.void', 'ยกเลิกบิล', 'pos', 'ยกเลิกบิลพร้อมเหตุผลและ audit trail'),
  ('pos.cash_movement', 'จัดการเงินระหว่างกะ', 'pos', 'เติม ถอน ค่าใช้จ่าย และนำส่งเงิน'),
  ('pos.approve_variance', 'อนุมัติเงินขาดเกิน', 'pos', 'อนุมัติความคลาดเคลื่อนตอนปิดกะ'),
  ('pos.manage_terminals', 'จัดการเครื่อง POS', 'system', 'ลงทะเบียนเครื่องพิมพ์ ลิ้นชัก และ print bridge'),
  ('pos.daily_close', 'ปิดยอดประจำวัน', 'pos', 'รวมทุกกะ ตรวจนับ และล็อกยอดสาขา'),
  ('inventory.count', 'ตรวจนับสต๊อก', 'backoffice', 'เปิดรอบ บันทึก และส่งตรวจนับ'),
  ('inventory.approve_count', 'อนุมัติผลตรวจนับ', 'backoffice', 'อนุมัติและโพสต์ส่วนต่างสต๊อก'),
  ('purchasing.request', 'ทำใบขอซื้อ', 'backoffice', 'สร้างและส่งใบขอซื้อ'),
  ('purchasing.approve', 'อนุมัติจัดซื้อ', 'backoffice', 'อนุมัติใบขอซื้อและใบสั่งซื้อ'),
  ('promotion.manage', 'จัดการโปรโมชั่น', 'backoffice', 'ตั้งโปรโมชั่น คูปอง และของแถม'),
  ('crm.credit', 'จัดการเครดิตลูกค้า', 'backoffice', 'บันทึกลูกหนี้และรับชำระ'),
  ('migration.manage', 'จัดการย้ายข้อมูล', 'system', 'ตรวจสอบ dry run นำเข้า และ rollback batch'),
  ('audit.view', 'ดู Audit Log', 'system', 'ตรวจสอบการเปลี่ยนแปลงและเหตุผล')
on conflict (code) do update set name = excluded.name, workspace = excluded.workspace, description = excluded.description;

insert into public.commerce_role_permissions(role_id, permission_code)
select r.id, p.code from public.commerce_roles r cross join public.commerce_permissions p
where r.code = 'commerce_owner'
on conflict do nothing;

insert into public.commerce_role_permissions(role_id, permission_code)
select r.id, v.permission_code from public.commerce_roles r cross join (values
  ('pos.change_price'), ('pos.discount'), ('pos.void'), ('pos.cash_movement'), ('pos.approve_variance'),
  ('pos.manage_terminals'), ('pos.daily_close'), ('inventory.count'), ('inventory.approve_count'), ('purchasing.request'),
  ('purchasing.approve'), ('promotion.manage'), ('crm.credit'), ('audit.view')
) as v(permission_code) where r.code = 'branch_manager'
on conflict do nothing;

insert into public.commerce_role_permissions(role_id, permission_code)
select r.id, v.permission_code from public.commerce_roles r cross join (values
  ('pos.discount'), ('pos.cash_movement')
) as v(permission_code) where r.code = 'cashier'
on conflict do nothing;

insert into public.commerce_role_permissions(role_id, permission_code)
select r.id, v.permission_code from public.commerce_roles r cross join (values
  ('inventory.count')
) as v(permission_code) where r.code = 'warehouse_staff'
on conflict do nothing;

insert into public.commerce_role_permissions(role_id, permission_code)
select r.id, v.permission_code from public.commerce_roles r cross join (values
  ('purchasing.request')
) as v(permission_code) where r.code = 'purchasing_staff'
on conflict do nothing;

create or replace view public.commerce_sales_reporting
with (security_invoker = true)
as
select s.id, s.branch_id, s.receipt_number as document_number, s.completed_at as transaction_at,
       s.customer_id, s.subtotal, s.discount_total, s.grand_total, s.status, false as is_legacy
from public.sales s
union all
select l.id, l.branch_id, l.document_number, l.transaction_at, l.customer_id,
       l.subtotal, l.discount_total, l.grand_total, l.transaction_type as status, true as is_legacy
from public.legacy_transactions l
where l.transaction_type in ('sale', 'return', 'void');

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'commerce_user_preferences', 'pos_terminals', 'product_barcodes', 'product_favorite_groups',
    'product_favorite_items', 'cash_movements', 'daily_closings', 'manager_approvals', 'pos_manager_pins', 'stock_lots',
    'stock_count_sessions', 'stock_count_items', 'purchase_requests', 'purchase_request_items',
    'supplier_returns', 'accounts_payable', 'stock_transfer_events', 'customer_tiers',
    'customer_credit_transactions', 'promotions', 'coupons', 'commission_rules',
    'commission_withdrawals', 'migration_batches', 'migration_rows', 'migration_id_map',
    'legacy_transactions', 'app_error_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant all privileges on table public.%I to service_role', table_name);
    execute format('drop policy if exists commerce_server_only on public.%I', table_name);
    execute format('create policy commerce_server_only on public.%I for all to authenticated using (false) with check (false)', table_name);
  end loop;
end $$;

revoke all on table public.commerce_sales_reporting from anon, authenticated;
grant select on table public.commerce_sales_reporting to service_role;

drop trigger if exists commerce_user_preferences_set_updated_at on public.commerce_user_preferences;
create trigger commerce_user_preferences_set_updated_at before update on public.commerce_user_preferences for each row execute function public.set_updated_at_timestamp();
drop trigger if exists pos_terminals_set_updated_at on public.pos_terminals;
create trigger pos_terminals_set_updated_at before update on public.pos_terminals for each row execute function public.set_updated_at_timestamp();
drop trigger if exists product_favorite_groups_set_updated_at on public.product_favorite_groups;
create trigger product_favorite_groups_set_updated_at before update on public.product_favorite_groups for each row execute function public.set_updated_at_timestamp();
drop trigger if exists daily_closings_set_updated_at on public.daily_closings;
create trigger daily_closings_set_updated_at before update on public.daily_closings for each row execute function public.set_updated_at_timestamp();
drop trigger if exists stock_count_sessions_set_updated_at on public.stock_count_sessions;
create trigger stock_count_sessions_set_updated_at before update on public.stock_count_sessions for each row execute function public.set_updated_at_timestamp();
drop trigger if exists purchase_requests_set_updated_at on public.purchase_requests;
create trigger purchase_requests_set_updated_at before update on public.purchase_requests for each row execute function public.set_updated_at_timestamp();
drop trigger if exists supplier_returns_set_updated_at on public.supplier_returns;
create trigger supplier_returns_set_updated_at before update on public.supplier_returns for each row execute function public.set_updated_at_timestamp();
drop trigger if exists accounts_payable_set_updated_at on public.accounts_payable;
create trigger accounts_payable_set_updated_at before update on public.accounts_payable for each row execute function public.set_updated_at_timestamp();
drop trigger if exists customer_tiers_set_updated_at on public.customer_tiers;
create trigger customer_tiers_set_updated_at before update on public.customer_tiers for each row execute function public.set_updated_at_timestamp();
drop trigger if exists promotions_set_updated_at on public.promotions;
create trigger promotions_set_updated_at before update on public.promotions for each row execute function public.set_updated_at_timestamp();
drop trigger if exists commission_rules_set_updated_at on public.commission_rules;
create trigger commission_rules_set_updated_at before update on public.commission_rules for each row execute function public.set_updated_at_timestamp();
drop trigger if exists migration_batches_set_updated_at on public.migration_batches;
create trigger migration_batches_set_updated_at before update on public.migration_batches for each row execute function public.set_updated_at_timestamp();

create or replace function public.commerce_post_stock_count(p_user_id uuid, p_stock_count_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.stock_count_sessions%rowtype;
  v_item public.stock_count_items%rowtype;
  v_balance public.stock_balances%rowtype;
  v_posted integer := 0;
begin
  select * into v_session from public.stock_count_sessions where id = p_stock_count_session_id for update;
  if not found or v_session.status <> 'approved' then raise exception 'stock count must be approved before posting' using errcode = '22023'; end if;
  if not public.commerce_has_permission(p_user_id, 'inventory.approve_count', v_session.branch_id) then raise exception 'stock count post access denied' using errcode = '42501'; end if;
  for v_item in select * from public.stock_count_items where stock_count_session_id = v_session.id for update loop
    if v_item.counted_quantity is null then raise exception 'all stock count items must be counted' using errcode = '22023'; end if;
    insert into public.stock_balances(branch_id, product_id) values (v_session.branch_id, v_item.product_id) on conflict (branch_id, product_id) do nothing;
    select * into v_balance from public.stock_balances where branch_id = v_session.branch_id and product_id = v_item.product_id for update;
    if v_item.counted_quantity < v_balance.reserved + v_balance.damaged then raise exception 'counted stock is lower than reserved or damaged stock' using errcode = '22023'; end if;
    if v_item.counted_quantity <> v_balance.on_hand then
      update public.stock_balances set on_hand = v_item.counted_quantity, updated_at = now() where branch_id = v_session.branch_id and product_id = v_item.product_id;
      insert into public.stock_movements(branch_id, product_id, movement_type, quantity_before, quantity_delta, quantity_after, reference_type, reference_id, note, performed_by_user_id)
      values (v_session.branch_id, v_item.product_id, case when v_item.counted_quantity > v_balance.on_hand then 'adjustment_in' else 'adjustment_out' end, v_balance.on_hand, v_item.counted_quantity - v_balance.on_hand, v_item.counted_quantity, 'stock_count', v_session.id, v_item.reason, p_user_id);
      v_posted := v_posted + 1;
    end if;
  end loop;
  update public.stock_count_sessions set status = 'posted', posted_at = now(), updated_at = now() where id = v_session.id;
  insert into public.commerce_audit_logs(actor_user_id, branch_id, action, entity_type, entity_id, payload) values (p_user_id, v_session.branch_id, 'stock_count.posted', 'stock_count_session', v_session.id, jsonb_build_object('adjusted_items', v_posted));
  return jsonb_build_object('stock_count_session_id', v_session.id, 'adjusted_items', v_posted);
end;
$$;
revoke all on function public.commerce_post_stock_count(uuid, uuid) from public, anon, authenticated;
grant execute on function public.commerce_post_stock_count(uuid, uuid) to service_role;

create or replace function private.commerce_record_credit_sale()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_customer_id uuid; v_credit_limit numeric(14,2); v_balance numeric(14,2);
begin
  if new.method <> 'credit' then return new; end if;
  select s.customer_id into v_customer_id from public.sales s where s.id = new.sale_id;
  if v_customer_id is null then raise exception 'credit payment requires a customer' using errcode = '22023'; end if;
  select credit_limit, credit_balance into v_credit_limit, v_balance from public.customers where id = v_customer_id for update;
  if v_balance + new.amount > v_credit_limit then raise exception 'customer credit limit exceeded' using errcode = '22023'; end if;
  update public.customers set credit_balance = v_balance + new.amount, updated_at = now() where id = v_customer_id;
  insert into public.customer_credit_transactions(customer_id, branch_id, transaction_type, amount, balance_after, reference_type, reference_id, performed_by_user_id)
  select v_customer_id, s.branch_id, 'charge', new.amount, v_balance + new.amount, 'sale', new.sale_id, new.received_by_user_id from public.sales s where s.id = new.sale_id;
  return new;
end; $$;
drop trigger if exists payments_record_customer_credit on public.payments;
create trigger payments_record_customer_credit after insert on public.payments for each row execute function private.commerce_record_credit_sale();

create or replace function private.commerce_reverse_credit_return()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_customer_id uuid; v_balance numeric(14,2); v_branch_id uuid; v_user_id uuid;
begin
  if new.method <> 'credit' then return new; end if;
  select customer_id, branch_id, performed_by_user_id into v_customer_id, v_branch_id, v_user_id from public.sale_returns where id = new.sale_return_id;
  if v_customer_id is null then return new; end if;
  select credit_balance into v_balance from public.customers where id = v_customer_id for update;
  update public.customers set credit_balance = greatest(0, v_balance - new.amount), updated_at = now() where id = v_customer_id;
  insert into public.customer_credit_transactions(customer_id, branch_id, transaction_type, amount, balance_after, reference_type, reference_id, performed_by_user_id)
  values (v_customer_id, v_branch_id, 'reversal', -new.amount, greatest(0, v_balance - new.amount), 'sale_return', new.sale_return_id, v_user_id);
  return new;
end; $$;
drop trigger if exists return_refunds_reverse_customer_credit on public.return_refunds;
create trigger return_refunds_reverse_customer_credit after insert on public.return_refunds for each row execute function private.commerce_reverse_credit_return();

create or replace function public.commerce_record_customer_credit_payment(p_user_id uuid, p_customer_id uuid, p_branch_id uuid, p_amount numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_balance numeric(14,2); v_after numeric(14,2); v_id uuid;
begin
  if p_amount <= 0 then raise exception 'payment amount must be positive' using errcode = '22023'; end if;
  if not public.commerce_has_permission(p_user_id, 'crm.credit', p_branch_id) then raise exception 'customer credit access denied' using errcode = '42501'; end if;
  select credit_balance into v_balance from public.customers where id = p_customer_id and is_active for update;
  if not found then raise exception 'active customer not found' using errcode = '22023'; end if;
  v_after := greatest(0, v_balance - p_amount);
  update public.customers set credit_balance = v_after, updated_at = now() where id = p_customer_id;
  insert into public.customer_credit_transactions(customer_id, branch_id, transaction_type, amount, balance_after, reference_type, note, performed_by_user_id)
  values (p_customer_id, p_branch_id, 'payment', -least(p_amount, v_balance), v_after, 'customer_payment', p_note, p_user_id) returning id into v_id;
  insert into public.commerce_audit_logs(actor_user_id, branch_id, action, entity_type, entity_id, payload) values (p_user_id, p_branch_id, 'customer.credit_paid', 'customer', p_customer_id, jsonb_build_object('amount', p_amount, 'balance_after', v_after));
  return jsonb_build_object('transaction_id', v_id, 'balance_after', v_after);
end; $$;
revoke all on function public.commerce_record_customer_credit_payment(uuid, uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.commerce_record_customer_credit_payment(uuid, uuid, uuid, numeric, text) to service_role;

create or replace function public.commerce_void_sale(p_user_id uuid, p_sale_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sale public.sales%rowtype;
  v_item public.sale_items%rowtype;
  v_before numeric(18,3);
  v_points numeric(14,2);
  v_credit numeric(14,2);
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'void reason is required' using errcode = '22023'; end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'sale not found' using errcode = 'P0002'; end if;
  if v_sale.legacy_read_only then raise exception 'legacy sale is read-only' using errcode = '22023'; end if;
  if v_sale.status <> 'completed' then raise exception 'only completed sale can be voided' using errcode = '22023'; end if;
  if not public.commerce_has_permission(p_user_id, 'pos.void', v_sale.branch_id) then raise exception 'sale void access denied' using errcode = '42501'; end if;
  if exists (select 1 from public.referral_commissions where sale_id = v_sale.id and status = 'paid') then
    raise exception 'paid commission must be reversed before voiding this sale' using errcode = '22023';
  end if;

  for v_item in select * from public.sale_items where sale_id = v_sale.id for update loop
    insert into public.stock_balances(branch_id, product_id) values (v_sale.branch_id, v_item.product_id) on conflict (branch_id, product_id) do nothing;
    select on_hand into v_before from public.stock_balances where branch_id = v_sale.branch_id and product_id = v_item.product_id for update;
    update public.stock_balances set on_hand = v_before + v_item.base_quantity, updated_at = now() where branch_id = v_sale.branch_id and product_id = v_item.product_id;
    insert into public.stock_movements(branch_id, product_id, movement_type, quantity_before, quantity_delta, quantity_after, reference_type, reference_id, note, performed_by_user_id)
    values (v_sale.branch_id, v_item.product_id, 'return', v_before, v_item.base_quantity, v_before + v_item.base_quantity, 'sale_void', v_sale.id, trim(p_reason), p_user_id);
  end loop;

  select coalesce(sum(points_delta), 0) into v_points from public.customer_point_transactions where sale_id = v_sale.id;
  if v_sale.customer_id is not null and v_points <> 0 then
    insert into public.customer_point_transactions(customer_id, sale_id, points_delta, transaction_type, note)
    values (v_sale.customer_id, v_sale.id, -v_points, 'reversal', 'ย้อนแต้มจากการยกเลิกบิล') on conflict (sale_id, transaction_type) do nothing;
    if found then update public.customers set points_balance = greatest(0, points_balance - v_points), updated_at = now() where id = v_sale.customer_id; end if;
  end if;

  select coalesce(sum(amount), 0) into v_credit from public.payments where sale_id = v_sale.id and method = 'credit';
  if v_sale.customer_id is not null and v_credit > 0 then
    update public.customers set credit_balance = greatest(0, credit_balance - v_credit), updated_at = now() where id = v_sale.customer_id;
    insert into public.customer_credit_transactions(customer_id, branch_id, transaction_type, amount, balance_after, reference_type, reference_id, note, performed_by_user_id)
    select v_sale.customer_id, v_sale.branch_id, 'reversal', -v_credit, credit_balance, 'sale_void', v_sale.id, trim(p_reason), p_user_id from public.customers where id = v_sale.customer_id;
  end if;

  if v_sale.register_session_id is not null then
    update public.pos_register_sessions set expected_cash = greatest(0, expected_cash - coalesce((select sum(amount) from public.payments where sale_id = v_sale.id and method = 'cash'), 0)), updated_at = now() where id = v_sale.register_session_id and status = 'open';
  end if;
  update public.referral_commissions set status = 'voided' where sale_id = v_sale.id and status = 'pending';
  update public.sales set status = 'voided', voided_at = now(), voided_by_user_id = p_user_id, void_reason = trim(p_reason) where id = v_sale.id;
  insert into public.commerce_audit_logs(actor_user_id, branch_id, action, entity_type, entity_id, payload)
  values (p_user_id, v_sale.branch_id, 'sale.voided', 'sale', v_sale.id, jsonb_build_object('receipt_number', v_sale.receipt_number, 'reason', trim(p_reason), 'grand_total', v_sale.grand_total));
  return jsonb_build_object('sale_id', v_sale.id, 'receipt_number', v_sale.receipt_number, 'status', 'voided');
end; $$;
revoke all on function public.commerce_void_sale(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.commerce_void_sale(uuid, uuid, text) to service_role;

create or replace function public.commerce_ship_stock_transfer_partial(p_user_id uuid, p_transfer_id uuid, p_items jsonb, p_carrier text default null, p_vehicle text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_transfer public.stock_transfers%rowtype; v_line jsonb; v_item public.stock_transfer_items%rowtype; v_unit public.product_units%rowtype; v_qty numeric(18,3); v_base numeric(18,3); v_before numeric(18,3);
begin
  select * into v_transfer from public.stock_transfers where id = p_transfer_id for update;
  if not found or v_transfer.status not in ('requested','approved') then raise exception 'transfer cannot be shipped' using errcode = '22023'; end if;
  if not public.commerce_has_permission(p_user_id, 'inventory.transfer', v_transfer.source_branch_id) then raise exception 'transfer ship access denied' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'shipped items are required' using errcode = '22023'; end if;
  for v_line in select value from jsonb_array_elements(p_items) loop
    select * into v_item from public.stock_transfer_items where id = (v_line->>'item_id')::uuid and stock_transfer_id = p_transfer_id for update;
    v_qty := round((v_line->>'quantity')::numeric, 3);
    if not found or v_qty < 0 or v_qty > v_item.quantity_requested then raise exception 'invalid shipped quantity' using errcode = '22023'; end if;
    if v_qty = 0 then continue; end if;
    select * into v_unit from public.product_units where id = v_item.product_unit_id and product_id = v_item.product_id;
    v_base := round(v_qty * v_unit.conversion_to_base, 3);
    insert into public.stock_balances(branch_id, product_id) values (v_transfer.source_branch_id, v_item.product_id) on conflict (branch_id, product_id) do nothing;
    select on_hand into v_before from public.stock_balances where branch_id = v_transfer.source_branch_id and product_id = v_item.product_id for update;
    if v_before - v_base < (select reserved + damaged from public.stock_balances where branch_id = v_transfer.source_branch_id and product_id = v_item.product_id) then raise exception 'insufficient available stock for transfer' using errcode = '22023'; end if;
    update public.stock_balances set on_hand = v_before - v_base, updated_at = now() where branch_id = v_transfer.source_branch_id and product_id = v_item.product_id;
    insert into public.stock_balances(branch_id, product_id) values (v_transfer.destination_branch_id, v_item.product_id) on conflict (branch_id, product_id) do nothing;
    update public.stock_balances set in_transit = in_transit + v_base, updated_at = now() where branch_id = v_transfer.destination_branch_id and product_id = v_item.product_id;
    update public.stock_transfer_items set quantity_shipped = v_qty, base_quantity_shipped = v_base where id = v_item.id;
    insert into public.stock_movements(branch_id, product_id, movement_type, quantity_before, quantity_delta, quantity_after, reference_type, reference_id, performed_by_user_id)
    values (v_transfer.source_branch_id, v_item.product_id, 'transfer_out', v_before, -v_base, v_before-v_base, 'stock_transfer', p_transfer_id, p_user_id);
  end loop;
  if not exists(select 1 from public.stock_transfer_items where stock_transfer_id=p_transfer_id and quantity_shipped>0) then raise exception 'at least one item must be shipped' using errcode='22023'; end if;
  update public.stock_transfers set status='in_transit', carrier_name=nullif(trim(p_carrier),''), vehicle_registration=nullif(trim(p_vehicle),''), shipped_by_user_id=p_user_id, shipped_at=now(), updated_at=now() where id=p_transfer_id;
  insert into public.stock_transfer_events(stock_transfer_id,event_type,note,performed_by_user_id) values(p_transfer_id,'shipped','Pick / Pack / Ship',p_user_id);
  return jsonb_build_object('transfer_id',p_transfer_id,'status','in_transit');
end; $$;

create or replace function public.commerce_receive_stock_transfer_partial(p_user_id uuid, p_transfer_id uuid, p_items jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_transfer public.stock_transfers%rowtype; v_line jsonb; v_item public.stock_transfer_items%rowtype; v_unit public.product_units%rowtype; v_received numeric(18,3); v_damaged numeric(18,3); v_received_base numeric(18,3); v_resolved_base numeric(18,3); v_before numeric(18,3); v_problem boolean := false;
begin
  select * into v_transfer from public.stock_transfers where id=p_transfer_id for update;
  if not found or v_transfer.status <> 'in_transit' then raise exception 'transfer cannot be received' using errcode='22023'; end if;
  if not public.commerce_has_permission(p_user_id,'inventory.transfer',v_transfer.destination_branch_id) then raise exception 'transfer receive access denied' using errcode='42501'; end if;
  for v_line in select value from jsonb_array_elements(p_items) loop
    select * into v_item from public.stock_transfer_items where id=(v_line->>'item_id')::uuid and stock_transfer_id=p_transfer_id for update;
    v_received:=round(coalesce((v_line->>'quantity_received')::numeric,0),3); v_damaged:=round(coalesce((v_line->>'quantity_damaged')::numeric,0),3);
    if not found or v_received<0 or v_damaged<0 or v_received+v_damaged>v_item.quantity_shipped then raise exception 'invalid received quantity' using errcode='22023'; end if;
    select * into v_unit from public.product_units where id=v_item.product_unit_id and product_id=v_item.product_id;
    v_received_base:=round(v_received*v_unit.conversion_to_base,3); v_resolved_base:=round((v_received+v_damaged)*v_unit.conversion_to_base,3);
    insert into public.stock_balances(branch_id,product_id) values(v_transfer.destination_branch_id,v_item.product_id) on conflict(branch_id,product_id) do nothing;
    select on_hand into v_before from public.stock_balances where branch_id=v_transfer.destination_branch_id and product_id=v_item.product_id for update;
    update public.stock_balances set on_hand=v_before+v_received_base, damaged=damaged+round(v_damaged*v_unit.conversion_to_base,3), in_transit=greatest(0,in_transit-v_item.base_quantity_shipped), updated_at=now() where branch_id=v_transfer.destination_branch_id and product_id=v_item.product_id;
    if v_received_base>0 then insert into public.stock_movements(branch_id,product_id,movement_type,quantity_before,quantity_delta,quantity_after,reference_type,reference_id,note,performed_by_user_id) values(v_transfer.destination_branch_id,v_item.product_id,'transfer_in',v_before,v_received_base,v_before+v_received_base,'stock_transfer',p_transfer_id,p_note,p_user_id); end if;
    update public.stock_transfer_items set quantity_received=v_received, quantity_damaged=v_damaged where id=v_item.id;
    if v_received+v_damaged <> v_item.quantity_shipped or v_damaged>0 then v_problem:=true; end if;
  end loop;
  update public.stock_transfers set status=case when v_problem then 'problem' else 'received' end, received_by_user_id=p_user_id, received_at=now(), updated_at=now() where id=p_transfer_id;
  insert into public.stock_transfer_events(stock_transfer_id,event_type,note,performed_by_user_id) values(p_transfer_id,case when v_problem then 'problem' else 'received' end,p_note,p_user_id);
  insert into public.commerce_audit_logs(actor_user_id,branch_id,action,entity_type,entity_id,payload) values(p_user_id,v_transfer.destination_branch_id,'transfer.received','stock_transfer',p_transfer_id,jsonb_build_object('has_problem',v_problem));
  return jsonb_build_object('transfer_id',p_transfer_id,'status',case when v_problem then 'problem' else 'received' end);
end; $$;
revoke all on function public.commerce_ship_stock_transfer_partial(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.commerce_receive_stock_transfer_partial(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.commerce_ship_stock_transfer_partial(uuid,uuid,jsonb,text,text) to service_role;
grant execute on function public.commerce_receive_stock_transfer_partial(uuid,uuid,jsonb,text) to service_role;
