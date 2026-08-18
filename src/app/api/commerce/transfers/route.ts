import { NextResponse } from 'next/server';
import { canAccessCommerceBranch, getCommerceRequestContext, hasCommercePermission, requireSupabaseAdmin } from '@/lib/commerceServer';

export async function GET(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูการโอนสินค้า' }, { status: 403 });
    const branchId = new URL(request.url).searchParams.get('branch_id') || context.profile.branch_id;
    if (!branchId || !hasCommercePermission(context.profile, 'inventory.transfer', branchId) || !canAccessCommerceBranch(context.profile, branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูข้อมูลสาขานี้' }, { status: 403 });
    const admin = requireSupabaseAdmin();
    const { data, error } = await admin.from('stock_transfers').select('id, transfer_number, source_branch_id, destination_branch_id, status, requested_at, carrier_name, vehicle_registration, note, stock_transfer_items(id, product_id, product_unit_id, quantity_requested, quantity_shipped, quantity_received, quantity_damaged, products(name), product_units(name))').or(`source_branch_id.eq.${branchId},destination_branch_id.eq.${branchId}`).order('requested_at', { ascending: false }).limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ transfers: data || [] });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load transfers' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการการโอนสินค้า' }, { status: 403 });
    const body = await request.json();
    const action = body.action === 'ship' || body.action === 'receive' ? body.action : 'create';
    const admin = requireSupabaseAdmin();
    if (action === 'ship' || action === 'receive') {
      const branchId = typeof body.branch_id === 'string' ? body.branch_id : '';
      const transferId = typeof body.transfer_id === 'string' ? body.transfer_id : '';
      if (!branchId || !transferId || !hasCommercePermission(context.profile, 'inventory.transfer', branchId)) return NextResponse.json({ error: 'ข้อมูลใบโอนไม่ถูกต้อง' }, { status: 400 });
      const suppliedItems = Array.isArray(body.items) ? body.items : null;
      let items = suppliedItems;
      if (!items) {
        const { data: transferItems } = await admin.from('stock_transfer_items').select('id, quantity_requested, quantity_shipped').eq('stock_transfer_id', transferId);
        items = (transferItems || []).map((item) => action === 'ship'
          ? { item_id: item.id, quantity: item.quantity_requested }
          : { item_id: item.id, quantity_received: item.quantity_shipped, quantity_damaged: 0 });
      }
      const functionName = action === 'ship' ? 'commerce_ship_stock_transfer_partial' : 'commerce_receive_stock_transfer_partial';
      const params = action === 'ship'
        ? { p_user_id: context.profile.id, p_transfer_id: transferId, p_items: items, p_carrier: typeof body.carrier === 'string' ? body.carrier : null, p_vehicle: typeof body.vehicle === 'string' ? body.vehicle : null }
        : { p_user_id: context.profile.id, p_transfer_id: transferId, p_items: items, p_note: typeof body.note === 'string' ? body.note : null };
      const { data, error } = await admin.rpc(functionName, params);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ result: data });
    }
    const sourceBranchId = typeof body.source_branch_id === 'string' ? body.source_branch_id : '';
    const destinationBranchId = typeof body.destination_branch_id === 'string' ? body.destination_branch_id : '';
    const items = Array.isArray(body.items) ? body.items : [];
    if (!sourceBranchId || !destinationBranchId || sourceBranchId === destinationBranchId || !hasCommercePermission(context.profile, 'inventory.transfer', sourceBranchId) || !canAccessCommerceBranch(context.profile, destinationBranchId) || !items.length) return NextResponse.json({ error: 'ข้อมูลคำขอโอนไม่ถูกต้อง' }, { status: 400 });
    const normalized = (items as unknown[]).map((item) => { const value = item as Record<string, unknown>; return { product_id: typeof value.product_id === 'string' ? value.product_id : '', product_unit_id: typeof value.product_unit_id === 'string' ? value.product_unit_id : '', quantity_requested: Number(value.quantity) }; });
    if (normalized.some((item) => !item.product_id || !item.product_unit_id || !Number.isFinite(item.quantity_requested) || item.quantity_requested <= 0)) return NextResponse.json({ error: 'รายการสินค้าไม่ถูกต้อง' }, { status: 400 });
    const productIds = [...new Set(normalized.map((item) => item.product_id))];
    const unitIds = [...new Set(normalized.map((item) => item.product_unit_id))];
    const [{ data: products, error: productsError }, { data: units, error: unitsError }] = await Promise.all([
      admin.from('products').select('id, is_active').in('id', productIds),
      admin.from('product_units').select('id, product_id, can_sell').in('id', unitIds),
    ]);
    if (productsError || unitsError) return NextResponse.json({ error: productsError?.message || unitsError?.message || 'ตรวจสอบสินค้าไม่สำเร็จ' }, { status: 400 });
    const productsById = new Map((products || []).map((product) => [product.id, product]));
    const unitsById = new Map((units || []).map((unit) => [unit.id, unit]));
    if (productIds.some((productId) => !productsById.get(productId)?.is_active)) return NextResponse.json({ error: 'มีสินค้าที่ปิดใช้งานหรือไม่พบในรายการ' }, { status: 400 });
    if (normalized.some((item) => {
      const unit = unitsById.get(item.product_unit_id);
      return !unit || unit.product_id !== item.product_id || unit.can_sell === false;
    })) return NextResponse.json({ error: 'หน่วยสินค้าที่เลือกไม่ตรงกับสินค้า หรือไม่เปิดให้โอนออก' }, { status: 400 });
    const { data: number, error: numberError } = await admin.rpc('commerce_next_transfer_number', { p_branch_id: sourceBranchId });
    if (numberError || !number) return NextResponse.json({ error: numberError?.message || 'ไม่สามารถออกเลขใบโอน' }, { status: 500 });
    const { data: transfer, error: transferError } = await admin.from('stock_transfers').insert({ transfer_number: number, source_branch_id: sourceBranchId, destination_branch_id: destinationBranchId, requested_by_user_id: context.profile.id, status: 'requested', note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null }).select('id, transfer_number').single();
    if (transferError || !transfer) return NextResponse.json({ error: transferError?.message || 'สร้างคำขอโอนไม่สำเร็จ' }, { status: 400 });
    const { error: itemsError } = await admin.from('stock_transfer_items').insert(normalized.map((item) => ({ ...item, stock_transfer_id: transfer.id })));
    if (itemsError) { await admin.from('stock_transfers').delete().eq('id', transfer.id); return NextResponse.json({ error: itemsError.message }, { status: 400 }); }
    return NextResponse.json({ transfer }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update transfer' }, { status: 500 }); }
}
