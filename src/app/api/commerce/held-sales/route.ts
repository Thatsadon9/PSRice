import { NextResponse } from 'next/server';
import { canAccessCommerceBranch, getCommerceRequestContext, hasCommercePermission, requireSupabaseAdmin } from '@/lib/commerceServer';

function canManageAnotherCashier(profile: { role: string }) {
  return profile.role === 'admin' || profile.role === 'manager';
}

export async function GET(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const branchId = new URL(request.url).searchParams.get('branch_id') || context.profile.branch_id;
    if (!branchId || !canAccessCommerceBranch(context.profile, branchId) || !hasCommercePermission(context.profile, 'pos.hold', branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูบิลพักของสาขานี้' }, { status: 403 });

    const admin = requireSupabaseAdmin();
    let query = admin.from('held_sales').select('id, held_number, items, note, held_by_user_id, created_at').eq('branch_id', branchId).eq('status', 'held').order('created_at', { ascending: false }).limit(40);
    if (!canManageAnotherCashier(context.profile)) query = query.eq('held_by_user_id', context.profile.id);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ heldSales: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load held sales' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const action = body.action === 'recall' || body.action === 'cancel' ? body.action : 'hold';
    const admin = requireSupabaseAdmin();

    if (action === 'hold') {
      const branchId = typeof body.branch_id === 'string' ? body.branch_id : '';
      if (!branchId || !canAccessCommerceBranch(context.profile, branchId) || !hasCommercePermission(context.profile, 'pos.hold', branchId) || !Array.isArray(body.items) || body.items.length === 0) return NextResponse.json({ error: 'ข้อมูลพักบิลไม่ถูกต้อง' }, { status: 400 });
      const items = (body.items as unknown[]).map((item: unknown) => {
        const value = item as Record<string, unknown>;
        return { product_id: value.product_id, product_unit_id: value.product_unit_id, quantity: Number(value.quantity), discount_amount: Number(value.discount_amount || 0) };
      });
      if (items.some((item) => typeof item.product_id !== 'string' || typeof item.product_unit_id !== 'string' || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.discount_amount) || item.discount_amount < 0)) return NextResponse.json({ error: 'รายการพักบิลไม่ถูกต้อง' }, { status: 400 });

      const heldNumber = `HB-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
      const { data, error } = await admin.from('held_sales').insert({
        held_number: heldNumber,
        branch_id: branchId,
        register_session_id: typeof body.register_session_id === 'string' ? body.register_session_id : null,
        held_by_user_id: context.profile.id,
        items,
        note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
      }).select('id, held_number, items, note, created_at').single();
      if (error || !data) return NextResponse.json({ error: error?.message || 'ไม่สามารถพักบิลได้' }, { status: 400 });
      return NextResponse.json({ heldSale: data }, { status: 201 });
    }

    const heldSaleId = typeof body.held_sale_id === 'string' ? body.held_sale_id : '';
    if (!heldSaleId) return NextResponse.json({ error: 'ไม่พบรายการพักบิล' }, { status: 400 });
    const { data: heldSale, error: heldError } = await admin.from('held_sales').select('id, branch_id, held_by_user_id, items, note, status').eq('id', heldSaleId).maybeSingle();
    if (heldError || !heldSale || heldSale.status !== 'held') return NextResponse.json({ error: 'ไม่พบบิลพักที่ใช้งานได้' }, { status: 404 });
    if (!canAccessCommerceBranch(context.profile, heldSale.branch_id) || !hasCommercePermission(context.profile, 'pos.hold', heldSale.branch_id) || (!canManageAnotherCashier(context.profile) && heldSale.held_by_user_id !== context.profile.id)) return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการบิลพักนี้' }, { status: 403 });

    const { error: updateError } = await admin.from('held_sales').update({ status: action === 'recall' ? 'recalled' : 'cancelled', recalled_by_user_id: context.profile.id, recalled_at: new Date().toISOString() }).eq('id', heldSaleId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ heldSale: { id: heldSale.id, items: heldSale.items, note: heldSale.note } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update held sale' }, { status: 500 });
  }
}
