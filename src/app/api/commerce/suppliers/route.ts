import { NextResponse } from 'next/server';
import { canManageCommerce, getCommerceRequestContext, requireSupabaseAdmin } from '@/lib/commerceServer';

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() || null : null;
}

export async function GET(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context || !canManageCommerce(context.profile)) return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูข้อมูลผู้ขายคู่ค้า' }, { status: 403 });
    const admin = requireSupabaseAdmin();
    const [suppliersResult, ordersResult] = await Promise.all([
      admin.from('suppliers').select('id, code, name, contact_name, phone, link, email, address, tax_id, payment_terms_days, is_active, created_at, updated_at').order('is_active', { ascending: false }).order('name'),
      admin.from('purchase_orders').select('supplier_id, document_date, grand_total, status').neq('status', 'cancelled').limit(10000),
    ]);
    const error = suppliersResult.error || ordersResult.error;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const metrics = new Map<string, { order_count: number; total_order_value: number; latest_order_date: string | null }>();
    for (const order of ordersResult.data || []) {
      const current = metrics.get(order.supplier_id) || { order_count: 0, total_order_value: 0, latest_order_date: null };
      current.order_count += 1;
      current.total_order_value += Number(order.grand_total || 0);
      if (!current.latest_order_date || order.document_date > current.latest_order_date) current.latest_order_date = order.document_date;
      metrics.set(order.supplier_id, current);
    }

    return NextResponse.json({
      suppliers: (suppliersResult.data || []).map((supplier) => ({
        ...supplier,
        ...(metrics.get(supplier.id) || { order_count: 0, total_order_value: 0, latest_order_date: null }),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load suppliers' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context || !canManageCommerce(context.profile)) return NextResponse.json({ error: 'ไม่มีสิทธิ์เพิ่มผู้ขายคู่ค้า' }, { status: 403 });
    const body = await request.json();
    const name = text(body.name);
    const code = text(body.code);
    const phone = text(body.phone);
    if (!name || !code || !phone) return NextResponse.json({ error: 'กรอกชื่อผู้ขายคู่ค้า รหัสคู่ค้า และเบอร์โทร' }, { status: 400 });
    const paymentTermsDays = Math.max(0, Math.trunc(Number(body.payment_terms_days) || 0));
    const admin = requireSupabaseAdmin();
    const { data: supplier, error } = await admin.from('suppliers').insert({
      code: code.toUpperCase(),
      name,
      contact_name: text(body.contact_name),
      phone,
      link: text(body.link),
      email: text(body.email),
      address: text(body.address),
      tax_id: text(body.tax_id),
      payment_terms_days: paymentTermsDays,
      is_active: true,
    }).select('id, code, name, contact_name, phone, link, email, address, tax_id, payment_terms_days, is_active, created_at, updated_at').single();
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'รหัสคู่ค้านี้มีอยู่แล้ว' : error.message }, { status: 400 });
    await admin.from('commerce_audit_logs').insert({ actor_user_id: context.profile.id, action: 'supplier.created', entity_type: 'supplier', entity_id: supplier.id, payload: { code: supplier.code, name: supplier.name } });
    return NextResponse.json({ supplier: { ...supplier, order_count: 0, total_order_value: 0, latest_order_date: null } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create supplier' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context || !canManageCommerce(context.profile)) return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขผู้ขายคู่ค้า' }, { status: 403 });
    const body = await request.json();
    const id = text(body.id);
    const name = text(body.name);
    const code = text(body.code);
    const phone = text(body.phone);
    if (!id || !name || !code || !phone) return NextResponse.json({ error: 'กรอกชื่อผู้ขายคู่ค้า รหัสคู่ค้า และเบอร์โทร' }, { status: 400 });
    const admin = requireSupabaseAdmin();
    const { data: before } = await admin.from('suppliers').select('*').eq('id', id).maybeSingle();
    if (!before) return NextResponse.json({ error: 'ไม่พบผู้ขายคู่ค้า' }, { status: 404 });
    const { data: supplier, error } = await admin.from('suppliers').update({
      code: code.toUpperCase(),
      name,
      contact_name: text(body.contact_name),
      phone,
      link: text(body.link),
      email: text(body.email),
      address: text(body.address),
      tax_id: text(body.tax_id),
      payment_terms_days: Math.max(0, Math.trunc(Number(body.payment_terms_days) || 0)),
      is_active: body.is_active !== false,
      updated_at: new Date().toISOString(),
    }).eq('id', id).select('id, code, name, contact_name, phone, link, email, address, tax_id, payment_terms_days, is_active, created_at, updated_at').single();
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'รหัสคู่ค้านี้มีอยู่แล้ว' : error.message }, { status: 400 });
    await admin.from('commerce_audit_logs').insert({ actor_user_id: context.profile.id, action: 'supplier.updated', entity_type: 'supplier', entity_id: id, payload: { before, after: supplier } });
    return NextResponse.json({ supplier });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update supplier' }, { status: 500 });
  }
}
