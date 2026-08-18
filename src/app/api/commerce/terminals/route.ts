import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  canAccessCommerceBranch,
  getCommerceRequestContext,
  hasCommercePermission,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';

export async function GET(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const branchId = new URL(request.url).searchParams.get('branch_id');
    if (!branchId || !canAccessCommerceBranch(context.profile, branchId)) return NextResponse.json({ error: 'Branch access denied' }, { status: 403 });
    const { data, error } = await requireSupabaseAdmin().from('pos_terminals').select('*').eq('branch_id', branchId).order('name');
    if (error) throw error;
    return NextResponse.json({ terminals: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load terminals' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const branchId = typeof body.branch_id === 'string' ? body.branch_id : '';
    if (!hasCommercePermission(context.profile, 'pos.manage_terminals', branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการเครื่อง POS' }, { status: 403 });

    const pairingToken = randomBytes(24).toString('base64url');
    const pairingTokenHash = createHash('sha256').update(pairingToken).digest('hex');
    const row = {
      branch_id: branchId,
      code: String(body.code || '').trim().toUpperCase(),
      name: String(body.name || '').trim(),
      printer_name: String(body.printer_name || '').trim() || null,
      receipt_width_mm: Number(body.receipt_width_mm) === 58 ? 58 : 80,
      cash_drawer_enabled: Boolean(body.cash_drawer_enabled),
      local_bridge_enabled: Boolean(body.local_bridge_enabled),
      pairing_token_hash: pairingTokenHash,
      created_by_user_id: context.profile.id,
    };
    if (!row.code || !row.name) return NextResponse.json({ error: 'กรอกรหัสและชื่อจุดขายให้ครบ' }, { status: 400 });
    const { data, error } = await requireSupabaseAdmin().from('pos_terminals').insert(row).select('*').single();
    if (error) throw error;
    return NextResponse.json({ terminal: data, pairing_token: pairingToken }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create terminal' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const branchId = typeof body.branch_id === 'string' ? body.branch_id : '';
    const terminalId = typeof body.terminal_id === 'string' ? body.terminal_id : '';
    if (!hasCommercePermission(context.profile, 'pos.manage_terminals', branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการเครื่อง POS' }, { status: 403 });
    const updates: Record<string, unknown> = {};
    for (const key of ['name', 'printer_name', 'receipt_width_mm', 'cash_drawer_enabled', 'local_bridge_enabled', 'is_active']) {
      if (key in body) updates[key] = body[key];
    }
    const { data, error } = await requireSupabaseAdmin().from('pos_terminals').update(updates).eq('id', terminalId).eq('branch_id', branchId).select('*').single();
    if (error) throw error;
    return NextResponse.json({ terminal: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update terminal' }, { status: 500 });
  }
}
