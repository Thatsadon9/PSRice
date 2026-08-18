import { NextResponse } from 'next/server';
import {
  canAccessCommerceBranch,
  clearCommerceRequestContextCache,
  getCommerceRequestContext,
  requireSupabaseAdmin,
} from '@/lib/commerceServer';

export async function GET(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = requireSupabaseAdmin();
    const embeddedPreference = context.profile.commercePreferences;
    const [{ data: branchRows, error: branchError }, preferenceResult] = await Promise.all([
      admin.from('branches').select('id, name, code').order('name'),
      embeddedPreference
        ? Promise.resolve({ data: null, error: null })
        : admin.from('commerce_user_preferences').select('last_branch_id, last_terminal_id, sidebar_collapsed, shortcuts').eq('user_id', context.profile.id).maybeSingle(),
    ]);
    if (branchError || preferenceResult.error) throw branchError || preferenceResult.error;

    const preference = embeddedPreference
      ? {
          last_branch_id: embeddedPreference.lastBranchId,
          last_terminal_id: embeddedPreference.lastTerminalId,
          sidebar_collapsed: embeddedPreference.sidebarCollapsed,
          shortcuts: embeddedPreference.shortcuts,
        }
      : preferenceResult.data;

    const branches = (branchRows || []).filter((branch) => canAccessCommerceBranch(context.profile, branch.id));
    const selectedBranchId = preference?.last_branch_id && canAccessCommerceBranch(context.profile, preference.last_branch_id)
      ? preference.last_branch_id
      : null;
    const { data: terminals, error: terminalError } = selectedBranchId
      ? await admin.from('pos_terminals').select('id, branch_id, code, name, printer_name, receipt_width_mm, cash_drawer_enabled, local_bridge_enabled, last_seen_at, is_active').eq('branch_id', selectedBranchId).eq('is_active', true).order('name')
      : { data: [], error: null };
    if (terminalError) throw terminalError;

    return NextResponse.json({
      branches,
      selectedBranchId,
      selectedTerminalId: preference?.last_terminal_id || null,
      terminals: terminals || [],
      sidebarCollapsed: Boolean(preference?.sidebar_collapsed),
      shortcuts: preference?.shortcuts || { payment: 'F9', fullscreen: 'F11' },
      permissions: [...new Set(context.profile.commerceAccess.flatMap((grant) => grant.permissionCodes))],
      suggestedBranchId: context.profile.branch_id && canAccessCommerceBranch(context.profile, context.profile.branch_id)
        ? context.profile.branch_id
        : branches[0]?.id || null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load Commerce context' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const branchId = typeof body.branch_id === 'string' ? body.branch_id : null;
    const terminalId = typeof body.terminal_id === 'string' && body.terminal_id ? body.terminal_id : null;
    const force = body.force === true;
    if (!branchId || !canAccessCommerceBranch(context.profile, branchId)) {
      return NextResponse.json({ error: 'คุณไม่มีสิทธิ์ใช้งานสาขานี้' }, { status: 403 });
    }

    const admin = requireSupabaseAdmin();
    const { data: currentPreference, error: currentError } = await admin
      .from('commerce_user_preferences')
      .select('last_branch_id')
      .eq('user_id', context.profile.id)
      .maybeSingle();
    if (currentError) throw currentError;

    if (!force && currentPreference?.last_branch_id && currentPreference.last_branch_id !== branchId) {
      const [{ count: registerCount, error: registerError }, { count: heldCount, error: heldError }] = await Promise.all([
        admin.from('pos_register_sessions').select('id', { count: 'exact', head: true }).eq('branch_id', currentPreference.last_branch_id).eq('opened_by_user_id', context.profile.id).eq('status', 'open'),
        admin.from('held_sales').select('id', { count: 'exact', head: true }).eq('branch_id', currentPreference.last_branch_id).eq('held_by_user_id', context.profile.id).eq('status', 'held'),
      ]);
      if (registerError || heldError) throw registerError || heldError;
      if ((registerCount || 0) > 0 || (heldCount || 0) > 0) {
        return NextResponse.json({
          error: 'สาขาเดิมยังมีกะเปิดหรือบิลพักอยู่',
          requires_confirmation: true,
          open_registers: registerCount || 0,
          held_sales: heldCount || 0,
        }, { status: 409 });
      }
    }

    if (terminalId) {
      const { data: terminal, error: terminalError } = await admin.from('pos_terminals').select('id').eq('id', terminalId).eq('branch_id', branchId).eq('is_active', true).maybeSingle();
      if (terminalError) throw terminalError;
      if (!terminal) return NextResponse.json({ error: 'เครื่อง POS ไม่ได้อยู่ในสาขาที่เลือก' }, { status: 400 });
    }

    const { error: saveError } = await admin.from('commerce_user_preferences').upsert({
      user_id: context.profile.id,
      last_branch_id: branchId,
      last_terminal_id: terminalId,
    }, { onConflict: 'user_id' });
    if (saveError) throw saveError;

    await admin.from('commerce_audit_logs').insert({
      actor_user_id: context.profile.id,
      branch_id: branchId,
      action: 'commerce.context.selected',
      entity_type: terminalId ? 'pos_terminal' : 'branch',
      entity_id: terminalId || branchId,
      payload: { previous_branch_id: currentPreference?.last_branch_id || null },
    });

    clearCommerceRequestContextCache(request);

    return NextResponse.json({ success: true, branch_id: branchId, terminal_id: terminalId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save Commerce context' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getCommerceRequestContext(request);
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const update: Record<string, unknown> = { user_id: context.profile.id };
    if (typeof body.sidebar_collapsed === 'boolean') update.sidebar_collapsed = body.sidebar_collapsed;
    if (body.shortcuts && typeof body.shortcuts === 'object') update.shortcuts = body.shortcuts;
    const { error } = await requireSupabaseAdmin().from('commerce_user_preferences').upsert(update, { onConflict: 'user_id' });
    if (error) throw error;
    clearCommerceRequestContextCache(request);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save preferences' }, { status: 500 });
  }
}
