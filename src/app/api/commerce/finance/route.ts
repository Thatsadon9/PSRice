import { NextResponse } from 'next/server';
import {
  canAccessCommerceBranch,
  canManageCommerce,
  getCommerceRequestContext,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';

type EntryKind = 'income' | 'expense';
type ExpenseAction = 'approve' | 'reject' | 'mark_paid';

const PAYMENT_METHODS = new Set(['cash', 'qr', 'transfer', 'card', 'other']);

function getBranchId(request: Request, fallback: string | null) {
  return new URL(request.url).searchParams.get('branch_id') || fallback;
}

export async function GET(request: Request) {
  const context = await getCommerceRequestContext(request);
  if (!context || !canManageCommerce(context.profile)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึงการเงิน' }, { status: 403 });
  }

  const branchId = getBranchId(request, context.profile.branch_id);
  if (!branchId || !canAccessCommerceBranch(context.profile, branchId)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึงสาขานี้' }, { status: 403 });
  }

  const admin = requireSupabaseAdmin();
  const [incomeResult, expenseResult] = await Promise.all([
    admin.from('incomes').select('*').eq('branch_id', branchId).order('income_date', { ascending: false }).order('created_at', { ascending: false }).limit(80),
    admin.from('expenses').select('*').eq('branch_id', branchId).order('expense_date', { ascending: false }).order('created_at', { ascending: false }).limit(80),
  ]);

  if (incomeResult.error || expenseResult.error) {
    return NextResponse.json({ error: incomeResult.error?.message || expenseResult.error?.message || 'โหลดข้อมูลไม่สำเร็จ' }, { status: 500 });
  }

  return NextResponse.json({ incomes: incomeResult.data, expenses: expenseResult.data });
}

export async function POST(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context || !canManageCommerce(context.profile)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์บันทึกรายการ' }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;
    const type = body.type as EntryKind;
    const branchId = typeof body.branch_id === 'string' ? body.branch_id : '';
    const amount = Number(body.amount);
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const paymentMethod = typeof body.payment_method === 'string' ? body.payment_method : 'cash';

    if (!['income', 'expense'].includes(type) || !branchId || !canAccessCommerceBranch(context.profile, branchId) || !Number.isFinite(amount) || amount <= 0 || !category || !PAYMENT_METHODS.has(paymentMethod)) {
      return NextResponse.json({ error: 'ข้อมูลรายการไม่ถูกต้อง' }, { status: 400 });
    }

    const dateField = type === 'income' ? 'income_date' : 'expense_date';
    const entryDate = typeof body.entry_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.entry_date) ? body.entry_date : undefined;
    const partyName = typeof body.party_name === 'string' ? body.party_name.trim() : null;
    const note = typeof body.note === 'string' ? body.note.trim() : null;
    const row = {
      branch_id: branchId,
      category,
      amount,
      payment_method: paymentMethod,
      note: note || null,
      recorded_by_user_id: context.profile.id,
      ...(entryDate ? { [dateField]: entryDate } : {}),
      ...(type === 'income' ? { payer_name: partyName || null } : { payee_name: partyName || null, status: 'pending' }),
    };
    const table = type === 'income' ? 'incomes' : 'expenses';
    const { data, error } = await adminFrom(table).insert(row).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'บันทึกรายการไม่สำเร็จ' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context || !canManageCommerce(context.profile)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์อนุมัติรายการ' }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;
    const expenseId = typeof body.expense_id === 'string' ? body.expense_id : '';
    const action = body.action as ExpenseAction;
    if (!expenseId || !['approve', 'reject', 'mark_paid'].includes(action)) {
      return NextResponse.json({ error: 'คำขอไม่ถูกต้อง' }, { status: 400 });
    }

    const admin = requireSupabaseAdmin();
    const { data: expense, error: lookupError } = await admin.from('expenses').select('id, branch_id, status').eq('id', expenseId).maybeSingle();
    if (lookupError || !expense) return NextResponse.json({ error: 'ไม่พบรายการรายจ่าย' }, { status: 404 });
    if (!canAccessCommerceBranch(context.profile, expense.branch_id)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการรายการของสาขานี้' }, { status: 403 });
    }

    const nextStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'paid';
    const allowed = action === 'mark_paid' ? expense.status === 'approved' : expense.status === 'pending';
    if (!allowed) return NextResponse.json({ error: 'สถานะรายการไม่สามารถเปลี่ยนได้' }, { status: 409 });

    const { data, error } = await admin
      .from('expenses')
      .update({ status: nextStatus, approved_by_user_id: context.profile.id, approved_at: new Date().toISOString() })
      .eq('id', expenseId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ expense: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'เปลี่ยนสถานะไม่สำเร็จ' }, { status: 500 });
  }
}

function adminFrom(table: 'incomes' | 'expenses') {
  return requireSupabaseAdmin().from(table);
}
