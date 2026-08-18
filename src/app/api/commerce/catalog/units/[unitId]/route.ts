import { NextResponse } from 'next/server';
import { canManageCommerce, getCommerceRequestContext, requireSupabaseAdmin } from '@/lib/commerceServer';

type RouteContext = { params: Promise<{ unitId: string }> };

function parseUnitPayload(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim().toLowerCase() : '';
  const conversion = Number(body.conversion_to_base);
  return {
    name,
    code,
    conversion,
    barcode: typeof body.barcode === 'string' && body.barcode.trim() ? body.barcode.trim() : null,
    allow_decimal: body.allow_decimal !== false,
    can_sell: body.can_sell !== false,
    can_receive: body.can_receive !== false,
  };
}

function unitErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('product_units_product_id_code_key')) return 'รหัสหน่วยนี้มีอยู่ในสินค้านี้แล้ว';
  if (normalized.includes('product_units_barcode_key')) return 'บาร์โค้ดนี้ถูกใช้กับหน่วยอื่นแล้ว';
  if (normalized.includes('foreign key') || normalized.includes('violates')) return 'หน่วยนี้ถูกใช้งานอยู่ในเอกสารหรือสต๊อก จึงลบไม่ได้';
  return message;
}

function objectPathFromPublicUrl(url: string | null) {
  if (!url) return null;
  const marker = '/storage/v1/object/public/product-images/';
  const index = url.indexOf(marker);
  if (index < 0) return null;
  try {
    return decodeURIComponent(url.slice(index + marker.length));
  } catch {
    return null;
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context || !canManageCommerce(context.profile)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขหน่วยสินค้า' }, { status: 403 });
    }

    const { unitId } = await params;
    const body = await request.json() as Record<string, unknown>;
    const unit = parseUnitPayload(body);
    if (!unitId || !unit.name || !unit.code || !Number.isFinite(unit.conversion) || unit.conversion <= 0) {
      return NextResponse.json({ error: 'ข้อมูลหน่วยสินค้าไม่ถูกต้อง' }, { status: 400 });
    }

    const admin = requireSupabaseAdmin();
    const { data: existing, error: existingError } = await admin
      .from('product_units')
      .select('id, product_id')
      .eq('id', unitId)
      .maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: 'ไม่พบหน่วยสินค้า' }, { status: 404 });
    if (typeof body.product_id === 'string' && body.product_id && body.product_id !== existing.product_id) {
      return NextResponse.json({ error: 'หน่วยนี้ไม่ตรงกับสินค้า' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('product_units')
      .update({ name: unit.name, code: unit.code, conversion_to_base: unit.conversion, barcode: unit.barcode, allow_decimal: unit.allow_decimal, can_sell: unit.can_sell, can_receive: unit.can_receive })
      .eq('id', unitId)
      .select('id, product_id, code, name, barcode, conversion_to_base, allow_decimal, is_default, can_sell, can_receive')
      .single();
    if (error) return NextResponse.json({ error: unitErrorMessage(error.message) }, { status: error.code === '23505' ? 409 : 400 });
    return NextResponse.json({ unit: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'แก้ไขหน่วยไม่สำเร็จ' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context || !canManageCommerce(context.profile)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ลบหน่วยสินค้า' }, { status: 403 });
    }

    const { unitId } = await params;
    const admin = requireSupabaseAdmin();
    const { data: existing, error: existingError } = await admin
      .from('product_units')
      .select('id, is_default, image_url')
      .eq('id', unitId)
      .maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: 'ไม่พบหน่วยสินค้า' }, { status: 404 });
    if (existing.is_default) return NextResponse.json({ error: 'ไม่สามารถลบหน่วยหลักได้' }, { status: 400 });

    const { error } = await admin.from('product_units').delete().eq('id', unitId);
    if (error) return NextResponse.json({ error: unitErrorMessage(error.message) }, { status: error.code === '23503' ? 409 : 400 });
    const objectPath = objectPathFromPublicUrl(existing.image_url);
    if (objectPath) await admin.storage.from('product-images').remove([objectPath]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'ลบหน่วยไม่สำเร็จ' }, { status: 500 });
  }
}
