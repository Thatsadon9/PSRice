import { NextResponse } from 'next/server';
import { getCommerceRequestContext, hasCommercePermission, requireSupabaseAdmin } from '@/lib/commerceServer';

export async function GET(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const sessionId = new URL(request.url).searchParams.get('session_id');
    if (!sessionId) return NextResponse.json({ error: 'Missing session' }, { status: 400 });
    const admin = requireSupabaseAdmin();
    const { data: session } = await admin.from('pos_register_sessions').select('branch_id').eq('id', sessionId).maybeSingle();
    if (!session || !hasCommercePermission(context.profile, 'pos.cash_movement', session.branch_id)) return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูเงินระหว่างกะ' }, { status: 403 });
    const { data, error } = await admin.from('cash_movements').select('*').eq('register_session_id', sessionId).order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ movements: data || [] });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load cash movements' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const sessionId = typeof body.session_id === 'string' ? body.session_id : '';
    const amount = Number(body.amount);
    const movementType = String(body.movement_type || '');
    const reason = String(body.reason || '').trim();
    if (!sessionId || !['cash_in', 'cash_out', 'expense', 'drop'].includes(movementType) || !Number.isFinite(amount) || amount <= 0 || !reason) return NextResponse.json({ error: 'ข้อมูลเงินระหว่างกะไม่ถูกต้อง' }, { status: 400 });
    const admin = requireSupabaseAdmin();
    const { data: session } = await admin.from('pos_register_sessions').select('id, branch_id, status, expected_cash').eq('id', sessionId).maybeSingle();
    if (!session || session.status !== 'open' || !hasCommercePermission(context.profile, 'pos.cash_movement', session.branch_id)) return NextResponse.json({ error: 'ไม่พบกะเปิดหรือไม่มีสิทธิ์' }, { status: 403 });
    const delta = movementType === 'cash_in' ? amount : -amount;
    const nextExpectedCash = Number(session.expected_cash) + delta;
    if (nextExpectedCash < 0) return NextResponse.json({ error: 'เงินสดตามระบบไม่เพียงพอสำหรับรายการนี้' }, { status: 400 });
    const { data, error } = await admin.from('cash_movements').insert({ register_session_id: sessionId, branch_id: session.branch_id, movement_type: movementType, amount, reason, performed_by_user_id: context.profile.id }).select('*').single();
    if (error) throw error;
    const { error: updateError } = await admin.from('pos_register_sessions').update({ expected_cash: nextExpectedCash }).eq('id', sessionId).eq('status', 'open');
    if (updateError) throw updateError;
    await admin.from('commerce_audit_logs').insert({ actor_user_id: context.profile.id, branch_id: session.branch_id, action: `register.${movementType}`, entity_type: 'pos_register_session', entity_id: sessionId, payload: { amount, reason } });
    return NextResponse.json({ movement: data, expected_cash: nextExpectedCash }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to record cash movement' }, { status: 500 }); }
}
