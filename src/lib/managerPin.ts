import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { requireSupabaseAdmin } from '@/lib/commerceServer';

export function hashManagerPin(pin: string, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(pin, salt, 64).toString('hex') };
}

export async function verifyManagerPin(branchId: string, pin: string, permissionCode: string) {
  if (!/^\d{4,8}$/.test(pin)) return null;
  const admin = requireSupabaseAdmin();
  const { data: pins } = await admin.from('pos_manager_pins').select('user_id,pin_salt,pin_hash,failed_attempts,locked_until').eq('branch_id', branchId);
  for (const row of pins || []) {
    if (row.locked_until && new Date(row.locked_until) > new Date()) continue;
    const { data: assignment } = await admin.from('commerce_user_role_assignments').select('role_id,commerce_role_permissions!inner(permission_code)').eq('user_id', row.user_id).or(`branch_id.is.null,branch_id.eq.${branchId}`).lte('valid_from', new Date().toISOString()).or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`).eq('commerce_role_permissions.permission_code', permissionCode).limit(1).maybeSingle();
    if (!assignment) continue;
    const actual = Buffer.from(scryptSync(pin, row.pin_salt, 64)), expected = Buffer.from(row.pin_hash, 'hex');
    if (expected.length === actual.length && timingSafeEqual(actual, expected)) { await admin.from('pos_manager_pins').update({ failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() }).eq('user_id', row.user_id).eq('branch_id', branchId); return row.user_id as string; }
  }
  return null;
}
