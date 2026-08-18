-- Commerce RBAC: additive layer. Existing Workforce roles remain as a safe
-- compatibility fallback while Commerce endpoints move to these permissions.

create table if not exists public.commerce_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_.-]{1,63}$'),
  name text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_permissions (
  code text primary key check (code ~ '^[a-z][a-z0-9_.-]{1,95}$'),
  name text not null,
  workspace text not null check (workspace in ('pos', 'backoffice', 'shop', 'system')),
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.commerce_role_permissions (
  role_id uuid not null references public.commerce_roles(id) on delete cascade,
  permission_code text not null references public.commerce_permissions(code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_code)
);

create table if not exists public.commerce_user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role_id uuid not null references public.commerce_roles(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  assigned_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_until > valid_from),
  unique (user_id, role_id, branch_id)
);

create index if not exists commerce_user_role_assignments_user_active_idx
  on public.commerce_user_role_assignments(user_id, valid_from, valid_until);
create index if not exists commerce_user_role_assignments_branch_idx
  on public.commerce_user_role_assignments(branch_id, user_id);

insert into public.commerce_permissions(code, name, workspace, description) values
  ('pos.sell', 'ขายหน้าร้าน', 'pos', 'สร้างรายการขายและรับชำระ'),
  ('pos.open_register', 'เปิดกะ POS', 'pos', 'เปิดจุดขายและระบุเงินทอน'),
  ('pos.close_register', 'ปิดกะ POS', 'pos', 'นับเงินและปิดกะ'),
  ('pos.hold', 'พักบิล', 'pos', 'พักและเรียกบิลกลับ'),
  ('pos.return', 'คืนสินค้า', 'pos', 'คืนสินค้าและคืนเงิน'),
  ('catalog.read', 'ดูแค็ตตาล็อก', 'backoffice', 'ดูสินค้า ราคา และสต็อก'),
  ('catalog.manage', 'จัดการแค็ตตาล็อก', 'backoffice', 'สร้างและแก้ไขสินค้า หมวด และหน่วย'),
  ('pricing.manage', 'จัดการราคา', 'backoffice', 'ตั้งราคาตามสาขาและกลุ่มลูกค้า'),
  ('inventory.read', 'ดูสต็อก', 'backoffice', 'ดูยอดและ movement สต็อก'),
  ('inventory.adjust', 'ปรับสต็อก', 'backoffice', 'ตรวจนับและปรับยอดสต็อก'),
  ('inventory.transfer', 'โอนสต็อก', 'backoffice', 'สร้าง อนุมัติ ส่ง และรับการโอน'),
  ('purchasing.manage', 'จัดการจัดซื้อ', 'backoffice', 'สร้างและอนุมัติใบสั่งซื้อ'),
  ('purchasing.receive', 'รับสินค้า', 'backoffice', 'รับสินค้าเข้าสต็อก'),
  ('crm.read', 'ดูลูกค้า', 'backoffice', 'ดูข้อมูลลูกค้าและประวัติ'),
  ('crm.manage', 'จัดการลูกค้า', 'backoffice', 'สร้างและแก้ไขลูกค้า'),
  ('commission.manage', 'จัดการคอมมิชชัน', 'backoffice', 'ตรวจและจ่ายคอมมิชชัน'),
  ('finance.read', 'ดูการเงิน', 'backoffice', 'ดูรายรับ รายจ่าย และสรุป'),
  ('finance.manage', 'จัดการการเงิน', 'backoffice', 'บันทึก อนุมัติ และจ่ายรายการ'),
  ('reports.view', 'ดูรายงาน', 'backoffice', 'ดูรายงานการขายและสต็อก'),
  ('system.manage_commerce_access', 'จัดการสิทธิ์ Commerce', 'system', 'ตั้ง role และสิทธิ์ผู้ใช้')
on conflict (code) do update set name = excluded.name, workspace = excluded.workspace, description = excluded.description;

insert into public.commerce_roles(code, name, description) values
  ('commerce_owner', 'เจ้าของระบบ Commerce', 'จัดการทุกส่วนทุกสาขา'),
  ('branch_manager', 'ผู้จัดการสาขา', 'บริหาร Commerce ภายในสาขาที่ได้รับมอบหมาย'),
  ('cashier', 'พนักงานขาย', 'ขายหน้าร้าน เปิด/ปิดกะ พักบิล และคืนสินค้า'),
  ('warehouse_staff', 'พนักงานคลัง', 'ดู ปรับ และโอนสต็อก รวมถึงรับสินค้า'),
  ('purchasing_staff', 'เจ้าหน้าที่จัดซื้อ', 'สร้าง อนุมัติ และรับสินค้า'),
  ('finance_staff', 'เจ้าหน้าที่การเงิน', 'จัดการรายการการเงินและรายงาน')
on conflict (code) do update set name = excluded.name, description = excluded.description;

insert into public.commerce_role_permissions(role_id, permission_code)
select r.id, p.code from public.commerce_roles r cross join public.commerce_permissions p
where r.code = 'commerce_owner'
on conflict do nothing;

insert into public.commerce_role_permissions(role_id, permission_code)
select r.id, p.code from public.commerce_roles r join public.commerce_permissions p on p.code <> 'system.manage_commerce_access'
where r.code = 'branch_manager'
on conflict do nothing;

insert into public.commerce_role_permissions(role_id, permission_code)
select r.id, v.permission_code from public.commerce_roles r cross join (values
  ('pos.sell'), ('pos.open_register'), ('pos.close_register'), ('pos.hold'), ('pos.return'), ('catalog.read')
) as v(permission_code) where r.code = 'cashier'
on conflict do nothing;

insert into public.commerce_role_permissions(role_id, permission_code)
select r.id, v.permission_code from public.commerce_roles r cross join (values
  ('catalog.read'), ('inventory.read'), ('inventory.adjust'), ('inventory.transfer'), ('purchasing.receive')
) as v(permission_code) where r.code = 'warehouse_staff'
on conflict do nothing;

insert into public.commerce_role_permissions(role_id, permission_code)
select r.id, v.permission_code from public.commerce_roles r cross join (values
  ('catalog.read'), ('purchasing.manage'), ('purchasing.receive'), ('inventory.read'), ('reports.view')
) as v(permission_code) where r.code = 'purchasing_staff'
on conflict do nothing;

insert into public.commerce_role_permissions(role_id, permission_code)
select r.id, v.permission_code from public.commerce_roles r cross join (values
  ('finance.read'), ('finance.manage'), ('reports.view'), ('commission.manage')
) as v(permission_code) where r.code = 'finance_staff'
on conflict do nothing;

-- Preserve access for existing staff while they are moved to fine-grained roles.
insert into public.commerce_user_role_assignments(user_id, role_id, branch_id)
select u.id, r.id, null
from public.users u join public.commerce_roles r on r.code = 'commerce_owner'
where u.status = 'active' and u.role = 'admin'::public.user_role
on conflict do nothing;

insert into public.commerce_user_role_assignments(user_id, role_id, branch_id)
select u.id, r.id, u.branch_id
from public.users u join public.commerce_roles r on r.code = 'branch_manager'
where u.status = 'active' and u.role = 'manager'::public.user_role
  and u.branch_id is not null
on conflict do nothing;

insert into public.commerce_user_role_assignments(user_id, role_id, branch_id)
select u.id, r.id, u.branch_id
from public.users u join public.commerce_roles r on r.code = 'cashier'
where u.status = 'active' and u.role = 'employee'::public.user_role
  and u.branch_id is not null
on conflict do nothing;

create or replace function public.commerce_has_permission(p_user_id uuid, p_permission_code text, p_branch_id uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1
    from public.users u
    join public.commerce_user_role_assignments ura on ura.user_id = u.id
    join public.commerce_role_permissions rp on rp.role_id = ura.role_id
    where u.id = p_user_id
      and u.status = 'active'::public.user_status
      and rp.permission_code = p_permission_code
      and ura.valid_from <= now()
      and (ura.valid_until is null or ura.valid_until > now())
      and (ura.branch_id is null or ura.branch_id = p_branch_id)
  );
$$;
revoke all on function public.commerce_has_permission(uuid, text, uuid) from public, anon, authenticated;

alter table public.commerce_roles enable row level security;
alter table public.commerce_permissions enable row level security;
alter table public.commerce_role_permissions enable row level security;
alter table public.commerce_user_role_assignments enable row level security;
revoke all on table public.commerce_roles, public.commerce_permissions, public.commerce_role_permissions, public.commerce_user_role_assignments from anon, authenticated;
grant all on table public.commerce_roles, public.commerce_permissions, public.commerce_role_permissions, public.commerce_user_role_assignments to service_role;
drop policy if exists commerce_server_only on public.commerce_roles;
drop policy if exists commerce_server_only on public.commerce_permissions;
drop policy if exists commerce_server_only on public.commerce_role_permissions;
drop policy if exists commerce_server_only on public.commerce_user_role_assignments;
create policy commerce_server_only on public.commerce_roles for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.commerce_permissions for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.commerce_role_permissions for all to authenticated using (false) with check (false);
create policy commerce_server_only on public.commerce_user_role_assignments for all to authenticated using (false) with check (false);
