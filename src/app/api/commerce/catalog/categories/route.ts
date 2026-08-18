import { NextResponse } from 'next/server';
import {
  canManageCommerce,
  getCommerceRequestContext,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';

export async function GET(request: Request) {
  const context = await getCommerceRequestContext(request);
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await requireSupabaseAdmin()
    .from('product_categories')
    .select('id, name, sort_order, is_active')
    .order('sort_order')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categories: data || [] });
}

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context || !canManageCommerce(context.profile)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการหมวดสินค้า' }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const sortOrder = Number(body.sort_order || 0);
    if (!name || name.length > 120 || !Number.isInteger(sortOrder) || sortOrder < 0) {
      return NextResponse.json({ error: 'ชื่อหรือการเรียงลำดับหมวดสินค้าไม่ถูกต้อง' }, { status: 400 });
    }

    const { data, error } = await requireSupabaseAdmin()
      .from('product_categories')
      .insert({ name, sort_order: sortOrder, is_active: true })
      .select('id, name, sort_order')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ category: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'สร้างหมวดสินค้าไม่สำเร็จ' }, { status: 500 });
  }
}
