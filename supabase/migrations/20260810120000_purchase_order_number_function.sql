create or replace function public.commerce_next_purchase_number(p_branch_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_counter integer;
begin
  if p_branch_id is null then raise exception 'branch is required' using errcode = '22023'; end if;
  insert into public.commerce_document_counters(branch_id, document_date, document_type, last_value)
  values (p_branch_id, current_date, 'purchase', 1)
  on conflict (branch_id, document_date, document_type) do update set last_value = public.commerce_document_counters.last_value + 1
  returning last_value into v_counter;
  return format('PO-%s-%s', to_char(current_date, 'YYMMDD'), lpad(v_counter::text, 4, '0'));
end;
$$;

revoke all on function public.commerce_next_purchase_number(uuid) from public, anon, authenticated;
grant execute on function public.commerce_next_purchase_number(uuid) to service_role;
