import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { NextResponse } from 'next/server';
import {
  canManageCommerce,
  getCommerceRequestContext,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ productId: string }> };

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

async function authorized(request: Request) {
  const context = await getCommerceRequestContext(request);
  if (!context || !canManageCommerce(context.profile)) return null;
  return context;
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const context = await authorized(request);
    if (!context) return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขรูปสินค้า' }, { status: 403 });
    const { productId } = await params;
    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File) || !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'เลือกไฟล์รูปภาพ JPG, PNG หรือ WebP' }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'รูปต้นฉบับต้องมีขนาดไม่เกิน 10 MB' }, { status: 400 });
    }

    const admin = requireSupabaseAdmin();
    const { data: existing, error: existingError } = await admin
      .from('products')
      .select('id, image_url')
      .eq('id', productId)
      .maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: 'ไม่พบสินค้า' }, { status: 404 });

    const source = Buffer.from(await file.arrayBuffer());
    let optimized = await sharp(source)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toBuffer();
    if (optimized.byteLength > 1_900_000) {
      optimized = await sharp(source)
        .rotate()
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 62, effort: 5 })
        .toBuffer();
    }

    const objectPath = `catalog/${productId}/${Date.now()}-${randomUUID()}.webp`;
    const { error: uploadError } = await admin.storage
      .from('product-images')
      .upload(objectPath, optimized, {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: false,
      });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });

    const { data: publicUrl } = admin.storage.from('product-images').getPublicUrl(objectPath);
    const { error: updateError } = await admin
      .from('products')
      .update({ image_url: publicUrl.publicUrl, image_is_permanent: true })
      .eq('id', productId);
    if (updateError) {
      await admin.storage.from('product-images').remove([objectPath]);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const previousPath = objectPathFromPublicUrl(existing.image_url);
    if (previousPath && previousPath !== objectPath) {
      await admin.storage.from('product-images').remove([previousPath]);
    }
    await admin.from('commerce_audit_logs').insert({
      actor_user_id: context.profile.id,
      action: 'catalog.product.image.updated',
      entity_type: 'product',
      entity_id: productId,
      payload: { image_url: publicUrl.publicUrl },
    });

    return NextResponse.json({ image_url: publicUrl.publicUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'อัปโหลดรูปไม่สำเร็จ' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const context = await authorized(request);
    if (!context) return NextResponse.json({ error: 'ไม่มีสิทธิ์ลบรูปสินค้า' }, { status: 403 });
    const { productId } = await params;
    const admin = requireSupabaseAdmin();
    const { data: product, error } = await admin.from('products').select('image_url').eq('id', productId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!product) return NextResponse.json({ error: 'ไม่พบสินค้า' }, { status: 404 });

    const { error: updateError } = await admin.from('products').update({ image_url: null }).eq('id', productId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    const objectPath = objectPathFromPublicUrl(product.image_url);
    if (objectPath) await admin.storage.from('product-images').remove([objectPath]);

    await admin.from('commerce_audit_logs').insert({
      actor_user_id: context.profile.id,
      action: 'catalog.product.image.removed',
      entity_type: 'product',
      entity_id: productId,
    });
    return NextResponse.json({ image_url: null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'ลบรูปสินค้าไม่สำเร็จ' }, { status: 500 });
  }
}
