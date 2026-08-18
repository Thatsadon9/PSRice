import { NextResponse } from 'next/server';
import { requireSupabaseAdmin } from '@/lib/commerceServer';

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const items = Array.isArray(body.items) ? body.items : [];
    const branchId = typeof body.branch_id === 'string' ? body.branch_id : '';
    const customerName = typeof body.customer_name === 'string' ? body.customer_name : '';
    const customerPhone = typeof body.customer_phone === 'string' ? body.customer_phone : '';
    const fulfillment = body.fulfillment_method === 'delivery' ? 'delivery' : body.fulfillment_method === 'pickup' ? 'pickup' : '';
    const payment = ['bank_transfer', 'qr', 'cash_on_pickup'].includes(String(body.payment_method)) ? String(body.payment_method) : '';
    if (!branchId || !customerName.trim() || !customerPhone.trim() || !fulfillment || !payment || !items.length || items.some((item) => !item || typeof item !== 'object' || typeof (item as Record<string, unknown>).product_id !== 'string' || typeof (item as Record<string, unknown>).product_unit_id !== 'string' || !Number.isFinite(Number((item as Record<string, unknown>).quantity)) || Number((item as Record<string, unknown>).quantity) <= 0)) {
      return NextResponse.json({ error: 'กรุณากรอกข้อมูลคำสั่งซื้อให้ครบถ้วน' }, { status: 400 });
    }
    const admin = requireSupabaseAdmin();
    const { data, error } = await admin.rpc('commerce_create_online_order', {
      p_branch_id: branchId,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_customer_email: typeof body.customer_email === 'string' ? body.customer_email : null,
      p_fulfillment_method: fulfillment,
      p_delivery_address: typeof body.delivery_address === 'string' ? body.delivery_address : null,
      p_payment_method: payment,
      p_items: items,
      p_note: typeof body.note === 'string' ? body.note : null,
    });
    if (error) return NextResponse.json({ error: error.message.includes('insufficient stock') ? 'สินค้าในตะกร้ามีจำนวนไม่เพียงพอ กรุณาลองใหม่' : error.message }, { status: 400 });
    return NextResponse.json({ order: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'ไม่สามารถสร้างคำสั่งซื้อได้' }, { status: 500 });
  }
}
