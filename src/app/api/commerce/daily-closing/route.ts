import { NextResponse } from 'next/server';
import { canAccessCommerceBranch, getCommerceRequestContext, hasCommercePermission, requireSupabaseAdmin } from '@/lib/commerceServer';

export async function GET(request: Request) {
  try {
    const context = await getCommerceRequestContext(request); if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const url = new URL(request.url), branchId = url.searchParams.get('branch_id') || '', date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    if (!canAccessCommerceBranch(context.profile, branchId) || !hasCommercePermission(context.profile, 'pos.daily_close', branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์ปิดยอดสาขา' }, { status: 403 });
    const admin = requireSupabaseAdmin(), start = `${date}T00:00:00+07:00`, endDate = new Date(`${date}T00:00:00+07:00`); endDate.setDate(endDate.getDate() + 1);
    const [{ data: sessions, error: sessionError }, { data: closing, error: closingError }] = await Promise.all([
      admin.from('pos_register_sessions').select('id, register_name, status, opening_float, expected_cash, counted_cash, cash_variance, opened_at, closed_at, users!pos_register_sessions_opened_by_user_id_fkey(name)').eq('branch_id', branchId).gte('opened_at', start).lt('opened_at', endDate.toISOString()).order('opened_at'),
      admin.from('daily_closings').select('*').eq('branch_id', branchId).eq('business_date', date).maybeSingle(),
    ]);
    if (sessionError || closingError) return NextResponse.json({ error: sessionError?.message || closingError?.message }, { status: 500 });
    return NextResponse.json({ sessions: sessions || [], closing });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'โหลดปิดยอดไม่สำเร็จ' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request); if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json(), branchId = String(body.branch_id || ''), date = String(body.business_date || ''), action = body.action === 'approve' ? 'approve' : 'submit';
    if (!date || !canAccessCommerceBranch(context.profile, branchId) || !hasCommercePermission(context.profile, 'pos.daily_close', branchId)) return NextResponse.json({ error: 'ไม่มีสิทธิ์ปิดยอดสาขา' }, { status: 403 });
    const admin = requireSupabaseAdmin();
    if (action === 'approve') {
      const { data, error } = await admin.from('daily_closings').update({ status: 'locked', approved_by_user_id: context.profile.id, approved_at: new Date().toISOString() }).eq('branch_id', branchId).eq('business_date', date).eq('status', 'submitted').select('*').single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await admin.from('commerce_audit_logs').insert({ actor_user_id: context.profile.id, branch_id: branchId, action: 'daily_closing.locked', entity_type: 'daily_closing', entity_id: data.id, payload: { business_date: date } });
      return NextResponse.json({ closing: data });
    }
    const start = `${date}T00:00:00+07:00`, next = new Date(start); next.setDate(next.getDate() + 1);
    const { data: sessions, error: sessionError } = await admin.from('pos_register_sessions').select('id, status, expected_cash, counted_cash').eq('branch_id', branchId).gte('opened_at', start).lt('opened_at', next.toISOString());
    if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
    if ((sessions || []).some((session) => session.status === 'open')) return NextResponse.json({ error: 'ยังมีกะเปิดอยู่ ต้องปิดทุกเครื่องก่อนปิดยอดวัน' }, { status: 409 });
    const sessionIds = (sessions || []).map((session) => session.id);
    const { data: sales } = sessionIds.length ? await admin.from('sales').select('id').in('register_session_id', sessionIds).neq('status', 'voided') : { data: [] };
    const saleIds = (sales || []).map((sale) => sale.id);
    const { data: payments } = saleIds.length ? await admin.from('payments').select('method, amount').in('sale_id', saleIds) : { data: [] };
    const totals = (payments || []).reduce<Record<string, number>>((result, row) => ({ ...result, [row.method]: (result[row.method] || 0) + Number(row.amount) }), {});
    const expectedCash = (sessions || []).reduce((sum, session) => sum + Number(session.expected_cash || 0), 0), countedCash = Number(body.counted_cash);
    if (!Number.isFinite(countedCash) || countedCash < 0) return NextResponse.json({ error: 'ยอดเงินสดนับจริงไม่ถูกต้อง' }, { status: 400 });
    const { data, error } = await admin.from('daily_closings').upsert({ branch_id: branchId, business_date: date, payment_totals: totals, expected_cash: expectedCash, counted_cash: countedCash, status: 'submitted', submitted_by_user_id: context.profile.id, note: typeof body.note === 'string' ? body.note.trim() || null : null }, { onConflict: 'branch_id,business_date' }).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await admin.from('commerce_audit_logs').insert({ actor_user_id: context.profile.id, branch_id: branchId, action: 'daily_closing.submitted', entity_type: 'daily_closing', entity_id: data.id, payload: { business_date: date, payment_totals: totals, cash_variance: countedCash - expectedCash } });
    return NextResponse.json({ closing: data });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'ปิดยอดไม่สำเร็จ' }, { status: 500 }); }
}
