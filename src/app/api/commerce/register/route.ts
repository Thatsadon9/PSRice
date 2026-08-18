import { NextResponse } from 'next/server';
import {
  canAccessCommerceBranch,
  getCommerceRequestContext,
  hasCommercePermission,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);

    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const action = body.action === 'close' ? 'close' : 'open';
    const admin = requireSupabaseAdmin();

    if (action === 'open') {
      const branchId = typeof body.branch_id === 'string' ? body.branch_id : '';
      const openingFloat = Number(body.opening_float || 0);
      const registerName = typeof body.register_name === 'string' && body.register_name.trim() ? body.register_name.trim() : 'Counter 1';
      let terminalId = context.profile.commercePreferences?.lastTerminalId || null;
      if (!context.profile.commercePreferences) {
        const { data: preference } = await admin.from('commerce_user_preferences').select('last_terminal_id').eq('user_id', context.profile.id).maybeSingle();
        terminalId = preference?.last_terminal_id || null;
      }

      if (!branchId || !canAccessCommerceBranch(context.profile, branchId) || !hasCommercePermission(context.profile, 'pos.open_register', branchId) || !Number.isFinite(openingFloat) || openingFloat < 0) {
        return NextResponse.json({ error: 'ข้อมูลเปิดกะไม่ถูกต้อง' }, { status: 400 });
      }

      const { data, error } = await admin
        .from('pos_register_sessions')
        .insert({
          branch_id: branchId,
          opened_by_user_id: context.profile.id,
          terminal_id: terminalId,
          register_name: registerName,
          opening_float: openingFloat,
          expected_cash: openingFloat,
        })
        .select('id, register_name, opening_float, expected_cash, opened_at')
        .single();

      if (error || !data) {
        return NextResponse.json({ error: error?.message || 'ไม่สามารถเปิดกะ POS ได้' }, { status: 400 });
      }

      return NextResponse.json({
        session: {
          id: data.id,
          registerName: data.register_name,
          openingFloat: Number(data.opening_float),
          expectedCash: Number(data.expected_cash),
          openedAt: data.opened_at,
        },
      }, { status: 201 });
    }

    const sessionId = typeof body.session_id === 'string' ? body.session_id : '';
    const countedCash = Number(body.counted_cash);

    if (!sessionId || !Number.isFinite(countedCash) || countedCash < 0) {
      return NextResponse.json({ error: 'ข้อมูลปิดกะไม่ถูกต้อง' }, { status: 400 });
    }

    const { data: session, error: sessionError } = await admin
      .from('pos_register_sessions')
      .select('id, branch_id, opened_by_user_id, expected_cash, status')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError || !session || session.status !== 'open') {
      return NextResponse.json({ error: 'ไม่พบกะ POS ที่กำลังเปิดอยู่' }, { status: 404 });
    }

    if (!canAccessCommerceBranch(context.profile, session.branch_id) || !hasCommercePermission(context.profile, 'pos.close_register', session.branch_id) || (context.profile.role === 'employee' && session.opened_by_user_id !== context.profile.id)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ปิดกะนี้' }, { status: 403 });
    }

    const expectedCash = Number(session.expected_cash);
    const { error: closeError } = await admin
      .from('pos_register_sessions')
      .update({
        status: 'closed',
        closed_by_user_id: context.profile.id,
        closed_at: new Date().toISOString(),
        counted_cash: countedCash,
        cash_variance: countedCash - expectedCash,
        note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
      })
      .eq('id', sessionId);

    if (closeError) {
      return NextResponse.json({ error: closeError.message }, { status: 500 });
    }

    const [{ data: payments }, { data: movements }] = await Promise.all([
      admin.from('payments').select('method, amount, sales!inner(register_session_id)').eq('sales.register_session_id', sessionId),
      admin.from('cash_movements').select('movement_type, amount').eq('register_session_id', sessionId),
    ]);
    const paymentTotals = (payments || []).reduce<Record<string, number>>((totals, payment) => ({ ...totals, [payment.method]: (totals[payment.method] || 0) + Number(payment.amount) }), {});
    const movementTotals = (movements || []).reduce<Record<string, number>>((totals, movement) => ({ ...totals, [movement.movement_type]: (totals[movement.movement_type] || 0) + Number(movement.amount) }), {});
    return NextResponse.json({ expectedCash, countedCash, variance: countedCash - expectedCash, paymentTotals, movementTotals });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update register';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
