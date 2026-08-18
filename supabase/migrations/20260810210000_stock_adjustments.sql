create table if not exists public.stock_adjustments (
  id uuid primary key default gen_random_uuid(), branch_id uuid not null references public.branches(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity_before numeric(18,3) not null, quantity_after numeric(18,3) not null check(quantity_after>=0),
  quantity_delta numeric(18,3) not null check(quantity_delta<>0), reason text not null, note text,
  performed_by_user_id uuid not null references public.users(id) on delete restrict, created_at timestamptz not null default now()
);
create index if not exists stock_adjustments_branch_created_idx on public.stock_adjustments(branch_id,created_at desc);
alter table public.stock_adjustments enable row level security;
revoke all on public.stock_adjustments from anon,authenticated; grant all on public.stock_adjustments to service_role;
create policy commerce_server_only on public.stock_adjustments for all to authenticated using(false) with check(false);
create or replace function public.commerce_adjust_stock(p_user_id uuid,p_branch_id uuid,p_product_id uuid,p_quantity_after numeric,p_reason text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor public.users%rowtype; v_before numeric(18,3); v_delta numeric(18,3); v_id uuid; begin
 if p_user_id is null or p_branch_id is null or p_product_id is null or p_quantity_after is null or p_quantity_after<0 or coalesce(trim(p_reason),'')='' then raise exception 'invalid stock adjustment' using errcode='22023';end if;
 select * into v_actor from public.users where id=p_user_id and status='active';if not found or(v_actor.role not in ('admin','manager'))or(v_actor.role<>'admin' and v_actor.branch_id<>p_branch_id)then raise exception 'not authorized' using errcode='42501';end if;
 insert into public.stock_balances(branch_id,product_id,on_hand,reserved,damaged) values(p_branch_id,p_product_id,0,0,0) on conflict(branch_id,product_id) do nothing;
 select on_hand into v_before from public.stock_balances where branch_id=p_branch_id and product_id=p_product_id for update;v_delta:=p_quantity_after-v_before;if v_delta=0 then raise exception 'no stock difference' using errcode='22023';end if;
 update public.stock_balances set on_hand=p_quantity_after,updated_at=now() where branch_id=p_branch_id and product_id=p_product_id;
 insert into public.stock_adjustments(branch_id,product_id,quantity_before,quantity_after,quantity_delta,reason,note,performed_by_user_id) values(p_branch_id,p_product_id,v_before,p_quantity_after,v_delta,trim(p_reason),nullif(trim(p_note),''),p_user_id)returning id into v_id;
 insert into public.stock_movements(branch_id,product_id,movement_type,quantity_before,quantity_delta,quantity_after,reference_type,reference_id,note,performed_by_user_id) values(p_branch_id,p_product_id,case when v_delta>0 then 'adjustment_in' else 'adjustment_out'end,v_before,v_delta,p_quantity_after,'stock_adjustment',v_id,nullif(trim(p_note),''),p_user_id);
 insert into public.commerce_audit_logs(actor_user_id,branch_id,action,entity_type,entity_id,payload)values(p_user_id,p_branch_id,'stock.adjusted','stock_adjustment',v_id,jsonb_build_object('before',v_before,'after',p_quantity_after,'reason',p_reason)); return jsonb_build_object('adjustment_id',v_id,'before',v_before,'after',p_quantity_after,'delta',v_delta);end;$$;
revoke all on function public.commerce_adjust_stock(uuid,uuid,uuid,numeric,text,text) from public,anon,authenticated;grant execute on function public.commerce_adjust_stock(uuid,uuid,uuid,numeric,text,text) to service_role;
