create or replace function public.commerce_award_online_order_points()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_points numeric(14,2); begin
  if old.status = 'completed' or new.status <> 'completed' or new.customer_id is null then return new; end if;
  v_points := floor(new.grand_total / 100); if v_points <= 0 then return new; end if;
  if exists (select 1 from public.customer_point_transactions where customer_id = new.customer_id and transaction_type = 'earn' and note = ('รับแต้มจากออเดอร์ออนไลน์ ' || new.order_number)) then return new; end if;
  insert into public.customer_point_transactions(customer_id,points_delta,transaction_type,note) values(new.customer_id,v_points,'earn','รับแต้มจากออเดอร์ออนไลน์ ' || new.order_number);
  update public.customers set points_balance=points_balance+v_points,updated_at=now() where id=new.customer_id;
  return new;
end;$$;
revoke all on function public.commerce_award_online_order_points() from public,anon,authenticated;
drop trigger if exists online_orders_award_customer_points on public.online_orders;
create trigger online_orders_award_customer_points after update of status on public.online_orders for each row execute function public.commerce_award_online_order_points();
