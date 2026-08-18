import { NextResponse } from 'next/server';
import { getCommerceRequestContext, hasCommercePermission, requireSupabaseAdmin } from '@/lib/commerceServer';
import { hashManagerPin, verifyManagerPin } from '@/lib/managerPin';

export async function PUT(request: Request) {
  try {
    const context = await getCommerceRequestContext(request); if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json(), branchId = String(body.branch_id || ''), pin = String(body.pin || '');
    if (!hasCommercePermission(context.profile, 'pos.void', branchId)) return NextResponse.json({ error: 'เฉพาะผู้จัดการที่มีสิทธิ์อนุมัติเท่านั้น' }, { status: 403 });
    if (!/^\d{4,8}$/.test(pin)) return NextResponse.json({ error: 'PIN ต้องเป็นตัวเลข 4–8 หลัก' }, { status: 400 });
    const value = hashManagerPin(pin), { error } = await requireSupabaseAdmin().from('pos_manager_pins').upsert({ user_id: context.profile.id, branch_id: branchId, pin_salt: value.salt, pin_hash: value.hash, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() });
    if (error) throw error; return NextResponse.json({ configured: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'ตั้ง PIN ไม่สำเร็จ' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try { const context = await getCommerceRequestContext(request); if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const body = await request.json(), managerId = await verifyManagerPin(String(body.branch_id || ''), String(body.pin || ''), String(body.permission_code || 'pos.void')); if (!managerId) return NextResponse.json({ error: 'Manager PIN ไม่ถูกต้องหรือไม่มีสิทธิ์' }, { status: 403 }); return NextResponse.json({ approved: true, manager_id: managerId }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'ตรวจ PIN ไม่สำเร็จ' }, { status: 500 }); }
}
