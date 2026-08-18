create table if not exists public.pos_branch_settings (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  promptpay_enabled boolean not null default false,
  promptpay_id text,
  promptpay_display_name text,
  default_register_name text not null default 'Counter 1',
  require_open_register boolean not null default true,
  show_out_of_stock boolean not null default false,
  enabled_payment_methods text[] not null default array['cash', 'qr', 'transfer', 'card', 'welfare', 'credit']::text[],
  receipt_footer text,
  updated_by_user_id uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (char_length(default_register_name) between 1 and 80),
  check (promptpay_id is null or char_length(promptpay_id) between 10 and 15),
  check (promptpay_display_name is null or char_length(promptpay_display_name) <= 80),
  check (receipt_footer is null or char_length(receipt_footer) <= 240),
  check (enabled_payment_methods <@ array['cash', 'qr', 'transfer', 'card', 'welfare', 'credit']::text[])
);

create index if not exists pos_branch_settings_updated_by_user_id_idx
  on public.pos_branch_settings(updated_by_user_id)
  where updated_by_user_id is not null;

drop trigger if exists pos_branch_settings_set_updated_at on public.pos_branch_settings;
create trigger pos_branch_settings_set_updated_at
before update on public.pos_branch_settings
for each row execute function public.set_updated_at_timestamp();

alter table public.pos_branch_settings enable row level security;
revoke all on public.pos_branch_settings from anon, authenticated;
grant all on public.pos_branch_settings to service_role;
create policy commerce_server_only on public.pos_branch_settings
  for all to authenticated using (false) with check (false);

insert into public.commerce_permissions(code, name, workspace, description)
values ('pos.manage_settings', 'ตั้งค่า POS', 'pos', 'กำหนดจุดขาย วิธีชำระเงิน และ PromptPay QR ของสาขา')
on conflict (code) do update set name = excluded.name, workspace = excluded.workspace, description = excluded.description;

insert into public.commerce_role_permissions(role_id, permission_code)
select r.id, 'pos.manage_settings'
from public.commerce_roles r
where r.code in ('commerce_owner', 'branch_manager')
on conflict do nothing;
