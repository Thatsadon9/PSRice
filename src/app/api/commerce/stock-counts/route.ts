import { NextResponse } from 'next/server';
import { canAccessCommerceBranch, getCommerceRequestContext, hasCommercePermission, requireSupabaseAdmin } from '@/lib/commerceServer';

export async function GET(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const params = new URL(request.url).searchParams; const branchId = params.get('branch_id') || ''; const sessionId = params.get('session_id');
    if (!branchId || !canAccessCommerceBranch(context.profile, branchId) || !hasCommercePermission(context.profile, 'inventory.read', branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูรอบตรวจนับ' }, { status: 403 });
    const admin = requireSupabaseAdmin();
    const { data: sessions, error } = await admin.from('stock_count_sessions').select('*').eq('branch_id', branchId).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    const { data: items, error: itemError } = sessionId
      ? await admin.from('stock_count_items').select('*, products(id, sku, barcode, name, image_url, base_unit_code, unit_inventory_mode), product_units(name, code, conversion_to_base, image_url), stock_count_sessions!inner(branch_id)').eq('stock_count_session_id', sessionId).eq('stock_count_sessions.branch_id', branchId).order('name', { referencedTable: 'products' })
      : { data: [], error: null };
    if (itemError) throw itemError;
    return NextResponse.json({ sessions: sessions || [], items: items || [] });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load stock counts' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json(); const action = String(body.action || 'create'); const branchId = String(body.branch_id || '');
    if (!branchId || !canAccessCommerceBranch(context.profile, branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์สาขา' }, { status: 403 });
    const admin = requireSupabaseAdmin();
    if (action === 'create') {
      if (!hasCommercePermission(context.profile, 'inventory.count', branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์เปิดรอบตรวจนับ' }, { status: 403 });
      let productsQuery = admin.from('products').select('id').eq('is_active', true);
      if (typeof body.category_id === 'string' && body.category_id) productsQuery = productsQuery.eq('category_id', body.category_id);
      const [{ data: products, error: productError }, { data: balances, error: balanceError }, { data: units, error: unitError }, { data: unitBalances, error: unitBalanceError }] = await Promise.all([
        productsQuery.select('id, unit_inventory_mode'),
        admin.from('stock_balances').select('product_id, on_hand').eq('branch_id', branchId),
        admin.from('product_units').select('id, product_id').order('is_default', { ascending: false }),
        admin.from('stock_unit_balances').select('product_id, product_unit_id, on_hand').eq('branch_id', branchId),
      ]);
      if (productError || balanceError || unitError || unitBalanceError) throw productError || balanceError || unitError || unitBalanceError;
      const balanceByProduct = new Map((balances || []).map((balance) => [balance.product_id, Number(balance.on_hand)]));
      const unitsByProduct = new Map<string, Array<{ id: string; product_id: string }>>();
      for (const unit of units || []) unitsByProduct.set(unit.product_id, [...(unitsByProduct.get(unit.product_id) || []), unit]);
      const unitBalanceById = new Map((unitBalances || []).map((balance) => [`${balance.product_id}:${balance.product_unit_id}`, Number(balance.on_hand)]));
      const countNumber = `CNT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const { data: session, error: sessionError } = await admin.from('stock_count_sessions').insert({ branch_id: branchId, count_number: countNumber, status: 'counting', scope: body.category_id ? { category_id: body.category_id } : { all_products: true }, started_by_user_id: context.profile.id, started_at: new Date().toISOString(), note: typeof body.note === 'string' ? body.note : null }).select('*').single();
      if (sessionError) throw sessionError;
      if (products?.length) {
        const rows: Array<{ stock_count_session_id: string; product_id: string; product_unit_id: string | null; system_quantity: number }> = [];
        for (const product of products) {
          if (product.unit_inventory_mode === 'separate_unit') {
            for (const unit of unitsByProduct.get(product.id) || []) rows.push({ stock_count_session_id: session.id, product_id: product.id, product_unit_id: unit.id, system_quantity: unitBalanceById.get(`${product.id}:${unit.id}`) || 0 });
          } else {
            rows.push({ stock_count_session_id: session.id, product_id: product.id, product_unit_id: null, system_quantity: balanceByProduct.get(product.id) || 0 });
          }
        }
        if (rows.length) { const inserted = await admin.from('stock_count_items').insert(rows); if (inserted.error) throw inserted.error; }
      }
      return NextResponse.json({ session }, { status: 201 });
    }
    const sessionId = String(body.session_id || '');
    const { data: session } = await admin.from('stock_count_sessions').select('*').eq('id', sessionId).eq('branch_id', branchId).maybeSingle();
    if (!session) return NextResponse.json({ error: 'ไม่พบรอบตรวจนับ' }, { status: 404 });
    if (action === 'count') {
      if (!hasCommercePermission(context.profile, 'inventory.count', branchId) || !['counting', 'draft'].includes(session.status)) return NextResponse.json({ error: 'รอบนี้ไม่เปิดให้บันทึกยอด' }, { status: 409 });
      const quantity = Number(body.counted_quantity); if (!Number.isFinite(quantity) || quantity < 0) return NextResponse.json({ error: 'จำนวนที่นับไม่ถูกต้อง' }, { status: 400 });
      const { error } = await admin.from('stock_count_items').update({ counted_quantity: quantity, reason: typeof body.reason === 'string' ? body.reason : null, counted_by_user_id: context.profile.id, counted_at: new Date().toISOString() }).eq('id', body.item_id).eq('stock_count_session_id', sessionId); if (error) throw error;
      return NextResponse.json({ success: true });
    }
    if (action === 'submit') {
      if (!hasCommercePermission(context.profile, 'inventory.count', branchId) || session.status !== 'counting') return NextResponse.json({ error: 'ส่งตรวจไม่ได้' }, { status: 409 });
      const { count } = await admin.from('stock_count_items').select('id', { count: 'exact', head: true }).eq('stock_count_session_id', sessionId).is('counted_quantity', null);
      if ((count || 0) > 0) return NextResponse.json({ error: `ยังนับไม่ครบ ${count} รายการ` }, { status: 409 });
      await admin.from('stock_count_sessions').update({ status: 'review' }).eq('id', sessionId); return NextResponse.json({ success: true });
    }
    if (action === 'approve') {
      if (!hasCommercePermission(context.profile, 'inventory.approve_count', branchId) || session.status !== 'review') return NextResponse.json({ error: 'ไม่มีสิทธิ์หรือสถานะไม่พร้อมอนุมัติ' }, { status: 403 });
      await admin.from('stock_count_sessions').update({ status: 'approved', approved_by_user_id: context.profile.id, approved_at: new Date().toISOString() }).eq('id', sessionId); return NextResponse.json({ success: true });
    }
    if (action === 'post') {
      if (!hasCommercePermission(context.profile, 'inventory.approve_count', branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์โพสต์ส่วนต่าง' }, { status: 403 });
      const { data, error } = await admin.rpc('commerce_post_stock_count', { p_user_id: context.profile.id, p_stock_count_session_id: sessionId }); if (error) return NextResponse.json({ error: error.message }, { status: 409 }); return NextResponse.json({ result: data });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update stock count' }, { status: 500 }); }
}
