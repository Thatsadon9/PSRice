create table if not exists public.referral_commissions (
  id uuid primary key default gen_random_uuid(),
  referrer_customer_id uuid not null references public.customers(id) on delete restrict,
  referred_customer_id uuid not null references public.customers(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete restrict,
  commission_rate numeric(7,4) not null default 0.01 check (commission_rate >= 0 and commission_rate <= 1),
  commission_amount numeric(14,2) not null check (commission_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'voided')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (sale_id)
);
create index if not exists referral_commissions_referrer_idx on public.referral_commissions(referrer_customer_id, status, created_at desc);
create index if not exists referral_commissions_referred_idx on public.referral_commissions(referred_customer_id, created_at desc);
alter table public.referral_commissions enable row level security;
revoke all on public.referral_commissions from anon, authenticated;
grant all on public.referral_commissions to service_role;
create policy commerce_server_only on public.referral_commissions for all to authenticated using (false) with check (false);

create or replace function public.commerce_create_referral_commission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_referrer uuid; begin
  if new.customer_id is null or new.status <> 'completed' then return new; end if;
  select referred_by_customer_id into v_referrer from public.customers where id = new.customer_id;
  if v_referrer is null then return new; end if;
  insert into public.referral_commissions(referrer_customer_id,referred_customer_id,sale_id,commission_amount)
  values(v_referrer,new.customer_id,new.id,round(new.grand_total*0.01,2)) on conflict(sale_id) do nothing;
  return new;
end; $$;
revoke all on function public.commerce_create_referral_commission() from public, anon, authenticated;
drop trigger if exists sales_create_referral_commission on public.sales;
create trigger sales_create_referral_commission after insert on public.sales for each row execute function public.commerce_create_referral_commission();
