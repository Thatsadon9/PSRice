alter table public.customers add column if not exists referral_code text;
alter table public.customers add column if not exists referred_by_customer_id uuid references public.customers(id) on delete set null;
create unique index if not exists customers_referral_code_unique on public.customers(referral_code) where referral_code is not null;
create index if not exists customers_referred_by_idx on public.customers(referred_by_customer_id);

create table if not exists public.customer_point_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  sale_id uuid references public.sales(id) on delete restrict,
  points_delta numeric(14,2) not null check (points_delta <> 0),
  transaction_type text not null check (transaction_type in ('earn', 'redeem', 'adjustment', 'reversal')),
  note text,
  created_at timestamptz not null default now(),
  unique (sale_id, transaction_type)
);
create index if not exists customer_point_transactions_customer_idx on public.customer_point_transactions(customer_id, created_at desc);

alter table public.customer_point_transactions enable row level security;
revoke all on public.customer_point_transactions from anon, authenticated;
grant all on public.customer_point_transactions to service_role;
create policy commerce_server_only on public.customer_point_transactions for all to authenticated using (false) with check (false);

create or replace function public.commerce_award_customer_points()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_points numeric(14,2);
begin
  if new.customer_id is null or new.status <> 'completed' then return new; end if;
  v_points := floor(new.grand_total / 100);
  if v_points <= 0 then return new; end if;
  insert into public.customer_point_transactions(customer_id, sale_id, points_delta, transaction_type, note)
  values (new.customer_id, new.id, v_points, 'earn', 'รับแต้มจากการซื้อ')
  on conflict (sale_id, transaction_type) do nothing;
  if found then update public.customers set points_balance = points_balance + v_points, updated_at = now() where id = new.customer_id; end if;
  return new;
end;
$$;
revoke all on function public.commerce_award_customer_points() from public, anon, authenticated;

drop trigger if exists sales_award_customer_points on public.sales;
create trigger sales_award_customer_points after insert on public.sales for each row execute function public.commerce_award_customer_points();
