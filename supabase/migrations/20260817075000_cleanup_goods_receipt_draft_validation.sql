create or replace function public.commerce_save_goods_receipt_draft(
  p_user_id uuid,
  p_draft_id uuid,
  p_branch_id uuid,
  p_purchase_order_id uuid,
  p_supplier_id uuid,
  p_received_at timestamptz,
  p_payment_method text,
  p_note text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_draft public.goods_receipt_drafts%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_product_id uuid;
  v_product_unit_id uuid;
  v_quantity numeric;
  v_unit_cost numeric;
  v_conversion numeric;
  v_base_quantity numeric;
  v_po_item public.purchase_order_items%rowtype;
  v_unit public.product_units%rowtype;
  v_number integer;
  v_draft_number text;
  v_count integer := 0;
begin
  if not exists (
    select 1 from public.users
    where id = p_user_id and status = 'active'::public.user_status
  ) then
    raise exception 'ผู้ใช้ไม่มีสิทธิ์ใช้งาน';
  end if;

  if not exists (
    select 1 from public.branches
    where id = p_branch_id and is_active = true
  ) then
    raise exception 'ไม่พบสาขาที่ใช้งาน';
  end if;

  if not public.commerce_has_permission(p_user_id, 'purchasing.receive', p_branch_id)
     and not public.commerce_has_permission(p_user_id, 'purchasing.manage', p_branch_id) then
    raise exception 'ไม่มีสิทธิ์รับสินค้า';
  end if;

  if p_purchase_order_id is null and p_supplier_id is null then
    raise exception 'ต้องระบุผู้ขายหรือใบสั่งซื้อ';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ต้องมีรายการสินค้าอย่างน้อยหนึ่งรายการ';
  end if;
  if coalesce(p_payment_method, 'cash') not in ('cash', 'transfer', 'credit', 'other') then
    raise exception 'วิธีชำระเงินไม่ถูกต้อง';
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers where id = p_supplier_id and is_active = true
  ) then
    raise exception 'ไม่พบผู้ขายที่ใช้งาน';
  end if;

  if p_purchase_order_id is not null and not exists (
    select 1 from public.purchase_orders
    where id = p_purchase_order_id
      and branch_id = p_branch_id
      and status in ('submitted', 'approved', 'partially_received')
  ) then
    raise exception 'ใบสั่งซื้อไม่พร้อมรับสินค้า';
  end if;

  if p_draft_id is null then
    insert into public.commerce_document_counters(branch_id, document_date, document_type, last_value)
    values (p_branch_id, current_date, 'goods_receipt_draft', 1)
    on conflict (branch_id, document_date, document_type)
    do update set last_value = public.commerce_document_counters.last_value + 1
    returning last_value into v_number;
    v_draft_number := 'DR-' || to_char(current_date, 'YYMMDD') || '-' || lpad(v_number::text, 4, '0');
    insert into public.goods_receipt_drafts(
      draft_number, branch_id, purchase_order_id, supplier_id,
      created_by_user_id, updated_by_user_id, received_at,
      payment_method, note
    ) values (
      v_draft_number, p_branch_id, p_purchase_order_id, p_supplier_id,
      p_user_id, p_user_id, coalesce(p_received_at, now()),
      coalesce(p_payment_method, 'cash'), nullif(p_note, '')
    ) returning * into v_draft;
  else
    select * into v_draft
    from public.goods_receipt_drafts
    where id = p_draft_id and branch_id = p_branch_id
    for update;
    if not found then
      raise exception 'ไม่พบใบนำเข้าที่พักไว้';
    end if;
    update public.goods_receipt_drafts
    set purchase_order_id = p_purchase_order_id,
        supplier_id = p_supplier_id,
        updated_by_user_id = p_user_id,
        received_at = coalesce(p_received_at, received_at),
        payment_method = coalesce(p_payment_method, payment_method),
        note = nullif(p_note, '')
    where id = p_draft_id;
  end if;

  delete from public.goods_receipt_draft_items where draft_id = v_draft.id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := nullif(v_item->>'purchase_order_item_id', '')::uuid;
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_product_unit_id := nullif(v_item->>'product_unit_id', '')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_cost := (v_item->>'unit_cost')::numeric;

    if v_quantity is null or v_quantity <= 0 or v_unit_cost is null or v_unit_cost < 0 then
      raise exception 'จำนวนและต้นทุนต้องถูกต้อง';
    end if;

    if p_purchase_order_id is not null then
      if v_item_id is null then
        raise exception 'รายการจากใบสั่งซื้อต้องอ้างอิงรายการเดิม';
      end if;
      select * into v_po_item
      from public.purchase_order_items
      where id = v_item_id and purchase_order_id = p_purchase_order_id;
      if not found then
        raise exception 'ไม่พบรายการในใบสั่งซื้อ';
      end if;
      if v_product_id is not null and v_product_id <> v_po_item.product_id then
        raise exception 'สินค้าไม่ตรงกับใบสั่งซื้อ';
      end if;
      if v_product_unit_id is not null and v_product_unit_id <> v_po_item.product_unit_id then
        raise exception 'หน่วยไม่ตรงกับใบสั่งซื้อ';
      end if;
      v_product_id := v_po_item.product_id;
      v_product_unit_id := v_po_item.product_unit_id;
      if v_po_item.quantity_received + v_quantity > v_po_item.quantity_ordered then
        raise exception 'จำนวนรับเกินจำนวนคงเหลือในใบสั่งซื้อ';
      end if;
    end if;

    perform 1
    from public.products where id = v_product_id and is_active = true;
    if not found then
      raise exception 'ไม่พบสินค้าที่ใช้งาน';
    end if;
    select * into v_unit
    from public.product_units
    where id = v_product_unit_id
      and product_id = v_product_id;
    if not found or (p_purchase_order_id is null and v_unit.can_receive = false) then
      raise exception 'หน่วยสินค้าไม่พร้อมรับเข้า';
    end if;
    v_conversion := coalesce(v_unit.conversion_to_base, 1);
    v_base_quantity := v_quantity * v_conversion;

    insert into public.goods_receipt_draft_items(
      draft_id, purchase_order_item_id, product_id, product_unit_id,
      quantity, base_quantity, unit_cost
    ) values (
      v_draft.id, v_item_id, v_product_id, v_product_unit_id,
      v_quantity, v_base_quantity, v_unit_cost
    );
    v_count := v_count + 1;
  end loop;

  insert into public.commerce_audit_logs(actor_user_id, branch_id, action, entity_type, entity_id, payload)
  values (
    p_user_id, p_branch_id, 'goods_receipt.draft_saved', 'goods_receipt_draft', v_draft.id,
    jsonb_build_object('draft_number', v_draft.draft_number, 'item_count', v_count, 'purchase_order_id', p_purchase_order_id)
  );

  return jsonb_build_object('draft_id', v_draft.id, 'draft_number', v_draft.draft_number, 'item_count', v_count);
end;
$$;

revoke all on function public.commerce_save_goods_receipt_draft(uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.commerce_save_goods_receipt_draft(uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, jsonb) to service_role;
