import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { type CommerceProfile, getCommerceRequestContext, hasCommercePermission, requireSupabaseAdmin } from '@/lib/commerceServer';
import { buildPosvisProductPreview, detectPosvisProductProfile, formatPosvisIssueMessage, POSVIS_DATA_TYPES, parsePosvisWorkbook, revalidatePosvisRows, type MigrationValidationRow, type PosvisDataType, validatePosvisRows } from '@/lib/posvisMigration';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function getSelectedBranchId(profile: CommerceProfile) {
  const preferenceBranchId = profile.commercePreferences?.lastBranchId;
  if (preferenceBranchId && profile.commerceAccess.some((grant) => grant.branchId === null || grant.branchId === preferenceBranchId)) return preferenceBranchId;
  if (profile.branch_id && profile.commerceAccess.some((grant) => grant.branchId === null || grant.branchId === profile.branch_id)) return profile.branch_id;
  return null;
}

function hasMigrationAccess(profile: CommerceProfile) {
  return hasCommercePermission(profile, 'migration.manage');
}

function parseFiniteMigrationNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMigrationCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function applyPosvisBarcodeConflicts(rows: MigrationValidationRow[]) {
  const admin = requireSupabaseAdmin();
  const barcodes = [...new Set(rows.map((row) => String(row.normalizedData.barcode || '')).filter(Boolean))];
  if (!barcodes.length) return 0;

  const { data: existingUnits, error: barcodeError } = await admin.from('product_units').select('barcode, product_id').in('barcode', barcodes);
  if (barcodeError) throw barcodeError;
  const existingProductIds = [...new Set((existingUnits || []).map((unit) => unit.product_id).filter(Boolean))];
  const { data: existingProducts, error: productError } = existingProductIds.length
    ? await admin.from('products').select('id, external_ref').in('id', existingProductIds)
    : { data: [], error: null };
  if (productError) throw productError;
  const productRefs = new Map((existingProducts || []).map((product) => [product.id, product.external_ref]));
  const existingByBarcode = new Map((existingUnits || []).map((unit) => [unit.barcode, { productId: unit.product_id, externalRef: productRefs.get(unit.product_id) || null }]));
  let conflictCount = 0;
  rows.forEach((row) => {
    const barcode = String(row.normalizedData.barcode || '');
    const existing = barcode ? existingByBarcode.get(barcode) : undefined;
    const expectedExternalRef = row.normalizedData.group_key ? `posvis-group:${String(row.normalizedData.group_key)}` : null;
    if (existing && existing.externalRef !== expectedExternalRef) {
      conflictCount += 1;
      row.status = 'error';
      row.errorCodes = [...new Set([...row.errorCodes, 'existing_barcode_conflict'])];
      const warningCodes = Array.isArray(row.normalizedData.warning_codes) ? row.normalizedData.warning_codes.map(String) : [];
      row.normalizedData = { ...row.normalizedData, warning_codes: warningCodes.filter((code) => code !== 'existing_barcode_conflict') };
      row.errorMessage = formatPosvisIssueMessage(row.errorCodes);
    }
  });
  return conflictCount;
}

async function refreshPosvisBatchValidation(batchId: string) {
  const admin = requireSupabaseAdmin();
  const { data: storedRows, error: rowError } = await admin.from('migration_rows')
    .select('id, row_number, external_ref, raw_data, normalized_data, status, error_codes, error_message')
    .eq('migration_batch_id', batchId)
    .order('row_number');
  if (rowError) throw rowError;

  const sourceRows = (storedRows || []).map((row) => ({
    rowNumber: row.row_number,
    externalRef: row.external_ref,
    rawData: (row.raw_data || {}) as Record<string, unknown>,
    normalizedData: (row.normalized_data || {}) as Record<string, unknown>,
    status: 'valid' as const,
    errorCodes: [],
    errorMessage: null,
  } satisfies MigrationValidationRow));
  const validated = revalidatePosvisRows(sourceRows);
  const conflictCount = await applyPosvisBarcodeConflicts(validated);

  for (let index = 0; index < validated.length; index += 1) {
    const row = validated[index];
    const stored = storedRows?.[index];
    if (!stored) continue;
    const { error } = await admin.from('migration_rows').update({
      external_ref: row.externalRef,
      normalized_data: row.normalizedData,
      status: row.status,
      error_codes: row.errorCodes,
      error_message: row.errorMessage,
    }).eq('id', stored.id);
    if (error) throw error;
  }

  const { data: currentBatch, error: batchError } = await admin.from('migration_batches').select('*').eq('id', batchId).single();
  if (batchError || !currentBatch) throw batchError || new Error('ไม่พบ migration batch');
  const preview = buildPosvisProductPreview(validated);
  const errorCount = validated.filter((row) => row.status === 'error').length;
  const summary = {
    ...((currentBatch.summary || {}) as Record<string, unknown>),
    duplicate_external_refs: validated.length - new Set(validated.map((row) => row.externalRef).filter(Boolean)).size,
    conflict_count: conflictCount,
    detected_profile: 'posvis_products',
    posvis_preview: { ...preview, products: preview.products.slice(0, 100) },
  };
  const { data: updatedBatch, error: updateError } = await admin.from('migration_batches').update({
    status: errorCount ? 'uploaded' : 'ready',
    dry_run: true,
    row_count: validated.length,
    valid_count: validated.length - errorCount,
    error_count: errorCount,
    summary,
  }).eq('id', batchId).select('*').single();
  if (updateError || !updatedBatch) throw updateError || new Error('อัปเดตผลตรวจสอบไม่สำเร็จ');
  const responseRows = validated.flatMap((row, index) => {
    const stored = storedRows?.[index];
    if (!stored) return [];
    return [{
      id: stored.id,
      row_number: row.rowNumber,
      external_ref: row.externalRef,
      normalized_data: row.normalizedData,
      status: row.status,
      error_codes: row.errorCodes,
      error_message: row.errorMessage,
    }];
  });
  return { batch: updatedBatch, rows: responseRows };
}

export async function GET(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasMigrationAccess(context.profile)) return NextResponse.json({ error: 'ไม่มีสิทธิ์ดู Migration Center' }, { status: 403 });
    const admin = requireSupabaseAdmin();
    const branchId = await getSelectedBranchId(context.profile);
    let batchesQuery = admin.from('migration_batches').select('*').order('created_at', { ascending: false }).limit(50);
    if (branchId) batchesQuery = batchesQuery.or(`branch_id.is.null,branch_id.eq.${branchId}`);
    const { data: batches, error } = await batchesQuery;
    if (error) throw error;
    const requestUrl = new URL(request.url);
    const batchId = requestUrl.searchParams.get('batch_id');
    const focusedRowNumber = Number(requestUrl.searchParams.get('row_number'));
    let batchList = batches || [];
    let rows: unknown[] = [];
    if (batchId) {
      const selectedBatch = batchList.find((batch) => batch.id === batchId);
      // Re-run the deterministic POSVis validator for editable batches when
      // they are opened. This also repairs previews created by an older
      // validator that treated repeated unit labels as duplicates.
      if (selectedBatch?.data_type === 'posvis_products' && ['ready', 'uploaded'].includes(selectedBatch.status)) {
        const refreshed = await refreshPosvisBatchValidation(batchId);
        batchList = batchList.map((batch) => batch.id === refreshed.batch.id ? refreshed.batch : batch);
        rows = Number.isInteger(focusedRowNumber) && focusedRowNumber > 0
          ? refreshed.rows.filter((row) => row.row_number === focusedRowNumber)
          : refreshed.rows.slice(0, 500);
      } else {
        let rowsQuery = admin.from('migration_rows').select('id, row_number, external_ref, normalized_data, status, error_codes, error_message, imported_entity_type, imported_entity_id').eq('migration_batch_id', batchId).order('row_number');
        rowsQuery = Number.isInteger(focusedRowNumber) && focusedRowNumber > 0 ? rowsQuery.eq('row_number', focusedRowNumber) : rowsQuery.limit(500);
        const result = await rowsQuery;
        if (result.error) throw result.error;
        rows = result.data || [];
      }
    }
    return NextResponse.json({ batches: batchList, rows, branch_id: branchId });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load migration batches' }, { status: 500 }); }
}

async function uploadProductImages(file: File, batchId: string) {
  const admin = requireSupabaseAdmin();
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const { data: products, error } = await admin.from('products').select('id, sku, external_ref');
  if (error) throw error;
  const productByRef = new Map<string, { id: string; sku: string }>();
  (products || []).forEach((product) => { productByRef.set(product.sku.toLocaleLowerCase(), product); if (product.external_ref) productByRef.set(product.external_ref.toLocaleLowerCase(), product); });
  const results: Array<{ row_number: number; external_ref: string; raw_data: object; normalized_data: object; status: string; error_codes: string[]; error_message: string | null; imported_entity_type?: string; imported_entity_id?: string }> = [];
  let rowNumber = 1;
  for (const [path, bytes] of Object.entries(archive)) {
    if (!/\.(jpe?g|png|webp)$/i.test(path) || path.includes('__MACOSX')) continue;
    const fileName = path.split('/').pop() || path;
    const externalRef = fileName.replace(/\.[^.]+$/, '').trim().toLocaleLowerCase();
    const product = productByRef.get(externalRef);
    if (!product) {
      results.push({ row_number: rowNumber++, external_ref: externalRef, raw_data: { path }, normalized_data: {}, status: 'error', error_codes: ['product_not_found'], error_message: 'ไม่พบ SKU/external_ref ที่ตรงกับชื่อไฟล์' });
      continue;
    }
    try {
      const optimized = await sharp(Buffer.from(bytes)).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
      if (optimized.length > 2_097_152) throw new Error('รูปใหญ่เกิน 2 MB หลังบีบอัด');
      const objectPath = `${product.id}/${createHash('sha256').update(optimized).digest('hex').slice(0, 16)}.webp`;
      const { error: uploadError } = await admin.storage.from('product-images').upload(objectPath, optimized, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = admin.storage.from('product-images').getPublicUrl(objectPath);
      const { error: updateError } = await admin.from('products').update({ image_url: publicUrl.publicUrl, image_is_permanent: true }).eq('id', product.id);
      if (updateError) throw updateError;
      results.push({ row_number: rowNumber++, external_ref: externalRef, raw_data: { path, original_bytes: bytes.length }, normalized_data: { object_path: objectPath, optimized_bytes: optimized.length }, status: 'imported', error_codes: [], error_message: null, imported_entity_type: 'product', imported_entity_id: product.id });
    } catch (issue) {
      results.push({ row_number: rowNumber++, external_ref: externalRef, raw_data: { path }, normalized_data: {}, status: 'error', error_codes: ['image_processing_failed'], error_message: issue instanceof Error ? issue.message : 'บีบอัดรูปไม่สำเร็จ' });
    }
  }
  if (results.length) await admin.from('migration_rows').insert(results.map((row) => ({ ...row, migration_batch_id: batchId })));
  const errorCount = results.filter((row) => row.status === 'error').length;
  await admin.from('migration_batches').update({ status: errorCount ? 'failed' : 'completed', dry_run: false, row_count: results.length, valid_count: results.length - errorCount, error_count: errorCount, completed_at: new Date().toISOString(), summary: { optimized_images: results.length - errorCount } }).eq('id', batchId);
  return { rowCount: results.length, errorCount };
}

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasMigrationAccess(context.profile)) return NextResponse.json({ error: 'ไม่มีสิทธิ์นำเข้าข้อมูล' }, { status: 403 });
    const form = await request.formData();
    const file = form.get('file');
    const requestedDataType = String(form.get('data_type') || 'auto');
    if (!(file instanceof File) || (requestedDataType !== 'auto' && !POSVIS_DATA_TYPES.includes(requestedDataType as PosvisDataType) && requestedDataType !== 'product_images')) return NextResponse.json({ error: 'เลือกประเภทและไฟล์ข้อมูลให้ถูกต้อง' }, { status: 400 });
    if (file.size > 40 * 1024 * 1024) return NextResponse.json({ error: 'ไฟล์ต้องไม่เกิน 40 MB ต่อ batch' }, { status: 413 });

    const buffer = await file.arrayBuffer();
    const checksum = createHash('sha256').update(Buffer.from(buffer)).digest('hex');
    const admin = requireSupabaseAdmin();
    const branchId = await getSelectedBranchId(context.profile);
    if (requestedDataType === 'product_images') {
      const { data: batch, error: batchError } = await admin.from('migration_batches').insert({ source_system: 'posvis', file_name: file.name, data_type: 'product_images', checksum, status: 'validating', dry_run: false, branch_id: branchId, created_by_user_id: context.profile.id }).select('*').single();
      if (batchError || !batch) throw batchError || new Error('สร้าง migration batch ไม่สำเร็จ');
      if (!file.name.toLocaleLowerCase().endsWith('.zip')) return NextResponse.json({ error: 'รูปสินค้าต้องเป็นไฟล์ ZIP' }, { status: 400 });
      const result = await uploadProductImages(file, batch.id);
      return NextResponse.json({ batch: { ...batch, status: result.errorCount ? 'failed' : 'completed', row_count: result.rowCount, error_count: result.errorCount } }, { status: 201 });
    }

    const rows = parsePosvisWorkbook(buffer, file.name);
    if (!rows.length) return NextResponse.json({ error: 'ไฟล์ไม่มีแถวข้อมูล' }, { status: 400 });
    if (rows.length > 50_000) return NextResponse.json({ error: 'หนึ่ง batch รองรับไม่เกิน 50,000 แถว' }, { status: 413 });
    const dataType = requestedDataType === 'auto' || (requestedDataType === 'products' && detectPosvisProductProfile(rows)) ? 'posvis_products' : requestedDataType;
    if (!POSVIS_DATA_TYPES.includes(dataType as PosvisDataType)) return NextResponse.json({ error: 'ระบบตรวจไม่พบโปรไฟล์ของไฟล์นี้' }, { status: 400 });
    const { data: batch, error: batchError } = await admin.from('migration_batches').insert({ source_system: 'posvis', file_name: file.name, data_type: dataType, checksum, status: 'validating', dry_run: true, branch_id: branchId, created_by_user_id: context.profile.id }).select('*').single();
    if (batchError || !batch) throw batchError || new Error('สร้าง migration batch ไม่สำเร็จ');

    const validated = validatePosvisRows(dataType as PosvisDataType, rows);
    const conflictCount = dataType === 'posvis_products' ? await applyPosvisBarcodeConflicts(validated) : 0;
    for (let offset = 0; offset < validated.length; offset += 500) {
      const { error: rowError } = await admin.from('migration_rows').insert(validated.slice(offset, offset + 500).map((row) => ({ migration_batch_id: batch.id, row_number: row.rowNumber, external_ref: row.externalRef, raw_data: row.rawData, normalized_data: row.normalizedData, status: row.status, error_codes: row.errorCodes, error_message: row.errorMessage })));
      if (rowError) throw rowError;
    }
    const errorCount = validated.filter((row) => row.status === 'error').length;
    const preview = dataType === 'posvis_products' ? buildPosvisProductPreview(validated) : null;
    const summary = {
      headers: Object.keys(rows[0] || {}),
      duplicate_external_refs: validated.length - new Set(validated.map((row) => row.externalRef).filter(Boolean)).size,
      conflict_count: conflictCount,
      detected_profile: dataType,
      posvis_preview: preview ? { ...preview, products: preview.products.slice(0, 100) } : null,
    };
    const { data: readyBatch, error: updateError } = await admin.from('migration_batches').update({ status: errorCount ? 'uploaded' : 'ready', row_count: validated.length, valid_count: validated.length - errorCount, error_count: errorCount, summary }).eq('id', batch.id).select('*').single();
    if (updateError) throw updateError;
    return NextResponse.json({ batch: readyBatch, rows: validated.slice(0, 100), preview }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to validate migration file' }, { status: 500 }); }
}

async function resolveBranch(code: string) {
  const admin = requireSupabaseAdmin();
  const byCode = await admin.from('branches').select('id').eq('code', code).maybeSingle();
  if (byCode.error) throw byCode.error;
  if (byCode.data) return byCode.data.id;
  const byExternalRef = await admin.from('branches').select('id').eq('external_ref', code).maybeSingle();
  if (byExternalRef.error) throw byExternalRef.error;
  return byExternalRef.data?.id || null;
}

async function importBatch(batch: { id: string; data_type: string }) {
  const admin = requireSupabaseAdmin();
  const { data: rows, error } = await admin.from('migration_rows').select('id, external_ref, normalized_data').eq('migration_batch_id', batch.id).in('status', ['valid', 'warning']).order('row_number');
  if (error) throw error;
  let imported = 0;
  for (const row of rows || []) {
    const value = row.normalized_data as Record<string, unknown>;
    let entityType = batch.data_type.replace(/s$/, '');
    let entityId: string | null = null;
    if (batch.data_type === 'branches') {
      const { data: existing } = await admin.from('branches').select('id').eq('code', String(value.code)).maybeSingle();
      if (existing) { entityId = existing.id; await admin.from('branches').update({ code: value.code, name: value.name, external_ref: value.external_ref }).eq('id', entityId); }
      else { const result = await admin.from('branches').insert({ code: value.code, name: value.name, external_ref: value.external_ref, latitude: 0, longitude: 0 }).select('id').single(); if (result.error) throw result.error; entityId = result.data.id; }
    } else if (batch.data_type === 'products') {
      let categoryId: string | null = null;
      if (value.category) { const found = await admin.from('product_categories').select('id').eq('name', value.category).maybeSingle(); if (found.data) categoryId = found.data.id; else { const created = await admin.from('product_categories').insert({ name: value.category }).select('id').single(); if (created.error) throw created.error; categoryId = created.data.id; } }
      const productPayload = { sku: value.sku, barcode: value.barcode || null, name: value.name, category_id: categoryId, base_unit_code: value.unit || 'ชิ้น', default_sale_price: value.price || 0, default_cost_price: value.cost || 0, external_ref: value.external_ref, is_active: true };
      const found = await admin.from('products').select('id').eq('sku', value.sku).maybeSingle();
      if (found.data) { entityId = found.data.id; const updated = await admin.from('products').update(productPayload).eq('id', entityId); if (updated.error) throw updated.error; }
      else { const created = await admin.from('products').insert(productPayload).select('id').single(); if (created.error) throw created.error; entityId = created.data.id; }
      const unitCode = String(value.unit || 'ชิ้น'); const unit = await admin.from('product_units').upsert({ product_id: entityId, code: unitCode, name: unitCode, conversion_to_base: value.conversion || 1, barcode: value.barcode || null, is_default: true }, { onConflict: 'product_id,code' }); if (unit.error) throw unit.error;
    } else if (batch.data_type === 'customers') {
      const payload = { full_name: value.name, phone: value.phone || null, email: value.email || null, member_code: value.member_code || null, external_ref: value.external_ref, is_active: true };
      const found = await admin.from('customers').select('id').eq('external_ref', value.external_ref).maybeSingle();
      if (found.data) { entityId = found.data.id; const updated = await admin.from('customers').update(payload).eq('id', entityId); if (updated.error) throw updated.error; } else { const created = await admin.from('customers').insert(payload).select('id').single(); if (created.error) throw created.error; entityId = created.data.id; }
    } else if (batch.data_type === 'suppliers') {
      const payload = { code: value.code || null, name: value.name, phone: value.phone || null, email: value.email || null, tax_id: value.tax_id || null, external_ref: value.external_ref, is_active: true };
      const found = await admin.from('suppliers').select('id').eq('external_ref', value.external_ref).maybeSingle();
      if (found.data) { entityId = found.data.id; const updated = await admin.from('suppliers').update(payload).eq('id', entityId); if (updated.error) throw updated.error; } else { const created = await admin.from('suppliers').insert(payload).select('id').single(); if (created.error) throw created.error; entityId = created.data.id; }
    } else if (batch.data_type === 'stock') {
      entityType = 'stock_balance'; const branchId = await resolveBranch(String(value.branch_code)); const product = await admin.from('products').select('id').eq('sku', value.sku).maybeSingle();
      if (!branchId || !product.data) throw new Error(`หา branch/SKU ไม่พบสำหรับ ${row.external_ref}`);
      const existing = await admin.from('stock_balances').select('on_hand').eq('branch_id', branchId).eq('product_id', product.data.id).maybeSingle();
      const before = Number(existing.data?.on_hand || 0); const quantity = Number(value.quantity || 0);
      const upsert = await admin.from('stock_balances').upsert({ branch_id: branchId, product_id: product.data.id, on_hand: quantity }, { onConflict: 'branch_id,product_id' }); if (upsert.error) throw upsert.error;
      if (before !== quantity) await admin.from('stock_movements').insert({ branch_id: branchId, product_id: product.data.id, movement_type: 'opening', quantity_before: before, quantity_delta: quantity - before, quantity_after: quantity, reference_type: 'migration_batch', reference_id: batch.id, note: 'POSVis cutover snapshot' });
      entityId = product.data.id;
    } else if (batch.data_type === 'legacy_sales') {
      entityType = 'legacy_transaction'; const branchId = await resolveBranch(String(value.branch_code)); if (!branchId) throw new Error(`ไม่พบสาขา ${value.branch_code}`);
      const inserted = await admin.from('legacy_transactions').upsert({ external_ref: value.external_ref, branch_id: branchId, transaction_type: 'sale', document_number: value.document_number, transaction_at: new Date(String(value.transaction_at)).toISOString(), subtotal: value.subtotal || 0, discount_total: value.discount_total || 0, grand_total: value.grand_total || 0, payload: value, migration_batch_id: batch.id }, { onConflict: 'external_ref' }).select('id').single(); if (inserted.error) throw inserted.error; entityId = inserted.data.id;
    }
    if (!entityId) throw new Error(`นำเข้าแถว ${row.id} ไม่สำเร็จ`);
    await admin.from('migration_id_map').upsert({ source_system: 'posvis', entity_type: entityType, external_ref: row.external_ref, internal_id: entityId, migration_batch_id: batch.id }, { onConflict: 'source_system,entity_type,external_ref' });
    await admin.from('migration_rows').update({ status: 'imported', imported_entity_type: entityType, imported_entity_id: entityId }).eq('id', row.id);
    imported += 1;
  }
  return imported;
}

async function commitPosvisProductBatch(batch: { id: string; branch_id?: string | null; summary?: Record<string, unknown> | null }, actorUserId: string, profile: CommerceProfile) {
  const admin = requireSupabaseAdmin();
  const conflictCount = Number(batch.summary?.conflict_count || 0);
  if (conflictCount > 0) {
    throw Object.assign(new Error('พบ barcode ที่ชนกับข้อมูลเดิม ต้องตรวจสอบก่อนนำเข้า'), { statusCode: 409 });
  }

  const branchId = batch.branch_id || await getSelectedBranchId(profile);
  if (!branchId) throw Object.assign(new Error('ยังไม่ได้เลือกสาขาปลายทางสำหรับการนำเข้า'), { statusCode: 400 });
  if (!profile.commerceAccess.some((grant) => grant.branchId === null || grant.branchId === branchId)) {
    throw Object.assign(new Error('ไม่มีสิทธิ์นำเข้าข้อมูลลงสาขานี้'), { statusCode: 403 });
  }

  const { data: dbRows, error: rowError } = await admin.from('migration_rows')
    .select('row_number, external_ref, raw_data, normalized_data, status, error_codes, error_message')
    .eq('migration_batch_id', batch.id)
    .in('status', ['valid', 'warning'])
    .order('row_number');
  if (rowError) throw rowError;

  const preview = buildPosvisProductPreview((dbRows || []).map((row) => ({
    rowNumber: row.row_number,
    externalRef: row.external_ref,
    rawData: (row.raw_data || {}) as Record<string, unknown>,
    normalizedData: (row.normalized_data || {}) as Record<string, unknown>,
    status: row.status as 'valid' | 'warning' | 'error',
    errorCodes: row.error_codes || [],
    errorMessage: row.error_message,
  })));
  const groups = preview.products.map((product) => ({
    group_key: product.groupKey,
    sku: product.sku,
    name: product.name,
    category_name: product.categoryName,
    base_unit_code: product.baseUnitCode,
    units: product.units.map((unit) => ({
      external_ref: unit.externalRef,
      barcode: unit.barcode,
      unit_code: unit.unitCode,
      unit_name: unit.unitName,
      conversion_to_base: unit.conversionToBase,
      stock: unit.stock,
      cost_price: unit.costPrice,
      sale_price: unit.salePrice,
      reorder_point: unit.reorderPoint,
      can_sell: unit.canSell,
      can_receive: unit.canReceive,
    })),
  }));

  await admin.from('migration_batches').update({ status: 'importing', dry_run: false }).eq('id', batch.id);
  const { data: result, error: rpcError } = await admin.rpc('commerce_import_posvis_product_batch', {
    p_batch_id: batch.id,
    p_branch_id: branchId,
    p_actor_user_id: actorUserId,
    p_groups: groups,
  });
  if (rpcError) {
    await admin.from('migration_batches').update({ status: 'ready', dry_run: true }).eq('id', batch.id);
    const errorWithStatus = rpcError as Error & { statusCode?: number };
    errorWithStatus.statusCode = /POSVIS_(?:BARCODE|EXISTING_STOCK)_CONFLICT/.test(rpcError.message) ? 409 : 500;
    throw errorWithStatus;
  }

  const imported = Number((result as Record<string, unknown> | null)?.units || preview.unitCount);
  const completedAt = new Date().toISOString();
  const { error: updateError } = await admin.from('migration_batches').update({
    status: 'completed',
    valid_count: imported,
    completed_at: completedAt,
    summary: { ...(batch.summary || {}), imported, import_result: result, branch_id: branchId },
  }).eq('id', batch.id);
  if (updateError) throw updateError;
  return { imported, result };
}

export async function PATCH(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasMigrationAccess(context.profile)) return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการ migration' }, { status: 403 });
    const body = await request.json(); const batchId = typeof body.batch_id === 'string' ? body.batch_id : '';
    const admin = requireSupabaseAdmin(); const { data: batch, error } = await admin.from('migration_batches').select('*').eq('id', batchId).maybeSingle();
    if (error || !batch) return NextResponse.json({ error: 'ไม่พบ migration batch' }, { status: 404 });
    if (body.action === 'delete_rows') {
      if (batch.data_type !== 'posvis_products') return NextResponse.json({ error: 'ลบรายการจาก preview รองรับเฉพาะไฟล์ POSVis สินค้า' }, { status: 400 });
      if (!['ready', 'uploaded'].includes(batch.status)) return NextResponse.json({ error: 'ลบได้เฉพาะ batch ที่ยังไม่ได้นำเข้าจริง' }, { status: 409 });
      const branchId = batch.branch_id || await getSelectedBranchId(context.profile);
      if (!branchId || !context.profile.commerceAccess.some((grant) => grant.branchId === null || grant.branchId === branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไข batch ของสาขานี้' }, { status: 403 });
      const rowIds = [...new Set((Array.isArray(body.row_ids) ? body.row_ids : []).filter((id: unknown): id is string => typeof id === 'string' && id.length > 0))];
      if (!rowIds.length || rowIds.length > 20) return NextResponse.json({ error: 'ต้องระบุรายการที่ต้องการลบ 1–20 รายการ' }, { status: 400 });
      const { data: rowsToDelete, error: rowsError } = await admin.from('migration_rows')
        .select('id, row_number, external_ref')
        .eq('migration_batch_id', batchId)
        .in('id', rowIds);
      if (rowsError) throw rowsError;
      if ((rowsToDelete || []).length !== rowIds.length) return NextResponse.json({ error: 'ไม่พบรายการที่ต้องการลบใน batch นี้' }, { status: 404 });
      const { error: deleteError } = await admin.from('migration_rows').delete().eq('migration_batch_id', batchId).in('id', rowIds);
      if (deleteError) throw deleteError;
      const refreshed = await refreshPosvisBatchValidation(batchId);
      await admin.from('commerce_audit_logs').insert({
        actor_user_id: context.profile.id,
        action: 'migration.preview_rows_deleted',
        entity_type: 'migration_batch',
        entity_id: batchId,
        payload: { row_ids: rowIds, row_numbers: (rowsToDelete || []).map((row) => row.row_number), external_refs: (rowsToDelete || []).map((row) => row.external_ref).filter(Boolean) },
      });
      return NextResponse.json({ success: true, batch: refreshed.batch, rows: refreshed.rows.slice(0, 500) });
    }
    if (body.action === 'edit_rows') {
      if (batch.data_type !== 'posvis_products') return NextResponse.json({ error: 'แก้ไขจาก preview รองรับเฉพาะไฟล์ POSVis สินค้า' }, { status: 400 });
      if (!['ready', 'uploaded'].includes(batch.status)) return NextResponse.json({ error: 'แก้ไขได้เฉพาะ batch ที่ยังไม่ได้นำเข้าจริง' }, { status: 409 });
      const branchId = batch.branch_id || await getSelectedBranchId(context.profile);
      if (!branchId || !context.profile.commerceAccess.some((grant) => grant.branchId === null || grant.branchId === branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไข batch ของสาขานี้' }, { status: 403 });
      const edits = Array.isArray(body.rows) ? body.rows : [];
      if (!edits.length || edits.length > 20) return NextResponse.json({ error: 'ต้องระบุแถวที่ต้องการแก้ไข 1–20 แถว' }, { status: 400 });
      const editIds = edits.map((edit: { id?: unknown }) => typeof edit.id === 'string' ? edit.id : '').filter(Boolean);
      if (editIds.length !== edits.length) return NextResponse.json({ error: 'ข้อมูลแถวที่แก้ไขไม่ถูกต้อง' }, { status: 400 });
      const { data: editedRows, error: rowsError } = await admin.from('migration_rows')
        .select('id, normalized_data')
        .eq('migration_batch_id', batchId)
        .in('id', editIds);
      if (rowsError) throw rowsError;
      const editedById = new Map((editedRows || []).map((row) => [row.id, row]));
      const editableKeys = new Set(['barcode', 'product_name', 'category_name', 'unit_name', 'conversion_to_base', 'stock', 'cost_price', 'sale_price', 'reorder_point', 'can_sell']);
      const preparedEdits: Array<{ id: string; sanitized: Record<string, unknown>; currentData: Record<string, unknown> }> = [];
      for (const edit of edits as Array<{ id: string; data?: Record<string, unknown> }>) {
        const stored = editedById.get(edit.id);
        if (!stored) return NextResponse.json({ error: 'ไม่พบแถวที่ต้องการแก้ไขใน batch นี้' }, { status: 404 });
        const patchData = edit.data && typeof edit.data === 'object' ? edit.data : null;
        if (!patchData) return NextResponse.json({ error: 'ข้อมูลที่แก้ไขไม่ถูกต้อง' }, { status: 400 });
        const sanitized = Object.fromEntries(Object.entries(patchData).filter(([key]) => editableKeys.has(key)));
        if (!Object.keys(sanitized).length) return NextResponse.json({ error: 'ไม่พบฟิลด์ที่แก้ไขได้' }, { status: 400 });
        preparedEdits.push({ id: edit.id, sanitized, currentData: { ...((stored.normalized_data || {}) as Record<string, unknown>) } });
      }

      const hasRelatedPriceEdit = preparedEdits.some(({ sanitized }) => Object.prototype.hasOwnProperty.call(sanitized, 'sale_price') || Object.prototype.hasOwnProperty.call(sanitized, 'cost_price'));
      const { data: allRows, error: allRowsError } = hasRelatedPriceEdit
        ? await admin.from('migration_rows').select('id, normalized_data').eq('migration_batch_id', batchId)
        : { data: editedRows, error: null };
      if (allRowsError) throw allRowsError;
      const updates = new Map<string, Record<string, unknown>>();
      const changedRowIds = new Set(editIds);
      (allRows || []).forEach((row) => updates.set(row.id, { ...((row.normalized_data || {}) as Record<string, unknown>) }));

      for (const { id, sanitized, currentData } of preparedEdits) {
        const nextData = { ...(updates.get(id) || currentData), ...sanitized };
        updates.set(id, nextData);
        for (const priceKey of ['sale_price', 'cost_price'] as const) {
          if (!Object.prototype.hasOwnProperty.call(sanitized, priceKey)) continue;
          const groupKey = String(nextData.group_key || '').trim();
          const targetConversion = parseFiniteMigrationNumber(nextData.conversion_to_base);
          const targetPrice = parseFiniteMigrationNumber(nextData[priceKey]);
          if (!groupKey || targetConversion === null || targetConversion <= 0 || targetPrice === null || targetPrice < 0) continue;
          updates.forEach((candidateData, candidateId) => {
            if (String(candidateData.group_key || '').trim() !== groupKey) return;
            const candidateConversion = parseFiniteMigrationNumber(candidateData.conversion_to_base);
            if (candidateConversion === null || candidateConversion <= 0) return;
            candidateData[priceKey] = roundMigrationCurrency((targetPrice / targetConversion) * candidateConversion);
            updates.set(candidateId, candidateData);
            changedRowIds.add(candidateId);
          });
        }
      }

      for (const [rowId, normalizedData] of updates) {
        if (!changedRowIds.has(rowId)) continue;
        const { error: updateError } = await admin.from('migration_rows').update({ normalized_data: normalizedData }).eq('id', rowId).eq('migration_batch_id', batchId);
        if (updateError) throw updateError;
      }
      const refreshed = await refreshPosvisBatchValidation(batchId);
      await admin.from('commerce_audit_logs').insert({ actor_user_id: context.profile.id, action: 'migration.preview_edited', entity_type: 'migration_batch', entity_id: batchId, payload: { row_ids: [...updates.keys()], edited_row_ids: editIds, related_price_update: hasRelatedPriceEdit, conflict_count: refreshed.batch.summary?.conflict_count || 0, error_count: refreshed.batch.error_count } });
      return NextResponse.json({ success: true, batch: refreshed.batch, rows: refreshed.rows.slice(0, 500) });
    }
    if (body.action === 'commit') {
      if (batch.status !== 'ready' || batch.error_count > 0 || batch.row_count <= 0) return NextResponse.json({ error: 'Batch ต้องมีรายการและผ่าน validation ทุกแถวก่อนนำเข้า' }, { status: 409 });
      if (batch.data_type === 'posvis_products') {
        const committed = await commitPosvisProductBatch(batch, context.profile.id, context.profile);
        return NextResponse.json({ success: true, imported: committed.imported, result: committed.result });
      }
      await admin.from('migration_batches').update({ status: 'importing', dry_run: false }).eq('id', batchId);
      const imported = await importBatch(batch);
      const completedAt = new Date().toISOString();
      await admin.from('migration_batches').update({ status: 'completed', valid_count: imported, completed_at: completedAt, summary: { ...(batch.summary || {}), imported } }).eq('id', batchId);
      await admin.from('commerce_audit_logs').insert({ actor_user_id: context.profile.id, action: 'migration.committed', entity_type: 'migration_batch', entity_id: batchId, payload: { data_type: batch.data_type, imported } });
      return NextResponse.json({ success: true, imported });
    }
    if (body.action === 'rollback') {
      if (batch.data_type === 'stock') return NextResponse.json({ error: 'ยอดเปิดสต๊อกต้อง rollback ผ่าน reconciliation เพื่อไม่ให้ทับ movement หลังเปิดขาย' }, { status: 409 });
      if (batch.data_type === 'legacy_sales') await admin.from('legacy_transactions').delete().eq('migration_batch_id', batchId);
      const { data: maps } = await admin.from('migration_id_map').select('entity_type, internal_id').eq('migration_batch_id', batchId);
      for (const map of maps || []) {
        if (map.entity_type === 'product') await admin.from('products').update({ is_active: false }).eq('id', map.internal_id);
        if (map.entity_type === 'customer') await admin.from('customers').update({ is_active: false }).eq('id', map.internal_id);
        if (map.entity_type === 'supplier') await admin.from('suppliers').update({ is_active: false }).eq('id', map.internal_id);
      }
      await admin.from('migration_batches').update({ status: 'rolled_back', rolled_back_at: new Date().toISOString() }).eq('id', batchId);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Unknown migration action' }, { status: 400 });
  } catch (error) {
    const statusCode = typeof error === 'object' && error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update migration batch' }, { status: statusCode });
  }
}
