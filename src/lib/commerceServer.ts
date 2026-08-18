import { getAuthenticatedRequestContext, getAuthenticatedUserId, supabaseAdmin } from '@/lib/serverAuth';
import type { User } from '@/lib/types';

export type CommerceRequestContext = {
  profile: CommerceProfile;
};

type CommerceAccessGrant = {
  branchId: string | null;
  permissionCodes: string[];
};

export type CommerceProfile = User & {
  commerceAccess: CommerceAccessGrant[];
  commercePreferences?: {
    lastBranchId: string | null;
    lastTerminalId: string | null;
    sidebarCollapsed: boolean;
    shortcuts: Record<string, string>;
  };
};

const COMMERCE_CONTEXT_TTL = 20_000;
const COMMERCE_CONTEXT_CACHE_LIMIT = 200;
const commerceContextCache = new Map<string, { value: CommerceRequestContext; expiresAt: number }>();
const commerceContextRequests = new Map<string, Promise<CommerceRequestContext | null>>();

function requestCacheKey(request: Request) {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : null;
}

function pruneCommerceContextCache() {
  const now = Date.now();
  for (const [key, entry] of commerceContextCache) {
    if (entry.expiresAt <= now) commerceContextCache.delete(key);
  }
  while (commerceContextCache.size > COMMERCE_CONTEXT_CACHE_LIMIT) {
    const oldestKey = commerceContextCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    commerceContextCache.delete(oldestKey);
  }
}

async function loadCommerceRequestContext(request: Request): Promise<CommerceRequestContext | null> {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return null;

  const admin = requireSupabaseAdmin();
  const { data: aggregatedProfile, error: aggregatedProfileError } = await admin
    .rpc('commerce_request_context', { p_user_id: userId });

  if (!aggregatedProfileError) {
    if (!aggregatedProfile || typeof aggregatedProfile !== 'object') return null;
    return { profile: aggregatedProfile as CommerceProfile };
  }

  // Compatibility fallback while an environment is still applying the
  // performance migration. It can be removed once every environment has it.
  const context = await getAuthenticatedRequestContext(request);

  if (!context || context.profile.status !== 'active') {
    return null;
  }

  const { data: assignments, error: assignmentsError } = await admin
    .from('commerce_user_role_assignments')
    .select('role_id, branch_id')
    .eq('user_id', context.profile.id)
    .lte('valid_from', new Date().toISOString())
    .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`);

  if (assignmentsError) {
    return null;
  }

  const roleIds = [...new Set((assignments || []).map((assignment) => assignment.role_id))];
  const { data: rolePermissions, error: permissionsError } = roleIds.length
    ? await admin.from('commerce_role_permissions').select('role_id, permission_code').in('role_id', roleIds)
    : { data: [], error: null };

  if (permissionsError) {
    return null;
  }

  const permissionsByRoleId = new Map<string, string[]>();
  (rolePermissions || []).forEach((permission) => {
    const current = permissionsByRoleId.get(permission.role_id) || [];
    current.push(permission.permission_code);
    permissionsByRoleId.set(permission.role_id, current);
  });

  return {
    profile: {
      ...context.profile,
      commerceAccess: (assignments || []).map((assignment) => ({
        branchId: assignment.branch_id,
        permissionCodes: permissionsByRoleId.get(assignment.role_id) || [],
      })),
    },
  };
}

export async function getCommerceRequestContext(request: Request): Promise<CommerceRequestContext | null> {
  const cacheKey = requestCacheKey(request);
  if (!cacheKey) return loadCommerceRequestContext(request);

  const cached = commerceContextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const pending = commerceContextRequests.get(cacheKey);
  if (pending) return pending;

  const requestPromise = loadCommerceRequestContext(request).then((context) => {
    if (context) {
      commerceContextCache.delete(cacheKey);
      commerceContextCache.set(cacheKey, {
        value: context,
        expiresAt: Date.now() + COMMERCE_CONTEXT_TTL,
      });
      pruneCommerceContextCache();
    }
    return context;
  }).finally(() => {
    commerceContextRequests.delete(cacheKey);
  });

  commerceContextRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

export function clearCommerceRequestContextCache(request: Request) {
  const cacheKey = requestCacheKey(request);
  if (!cacheKey) return;
  commerceContextCache.delete(cacheKey);
  commerceContextRequests.delete(cacheKey);
}

export function canAccessCommerceBranch(profile: CommerceProfile, branchId: string) {
  return profile.commerceAccess.some((grant) => grant.branchId === null || grant.branchId === branchId);
}

export function hasCommercePermission(profile: CommerceProfile, permissionCode: string, branchId?: string | null) {
  return profile.commerceAccess.some((grant) =>
    grant.permissionCodes.includes(permissionCode) && (grant.branchId === null || (branchId != null && grant.branchId === branchId)),
  );
}

export function canManageCommerce(profile: CommerceProfile) {
  return profile.commerceAccess.some((grant) => grant.permissionCodes.some((permissionCode) => permissionCode.endsWith('.manage') || permissionCode === 'inventory.adjust'));
}

export function requireSupabaseAdmin() {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client is not configured');
  }

  return supabaseAdmin;
}
