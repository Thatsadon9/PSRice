import type { User } from './types';

export type AdminViewMode = 'manager' | 'employee';

export function canUseEmployeeArea(user: User | null, adminViewMode: AdminViewMode) {
  if (!user) {
    return false;
  }

  return user.role === 'employee' || (user.role === 'admin' && adminViewMode === 'employee');
}

export function getLandingPath(user: User | null, adminViewMode: AdminViewMode) {
  if (!user) {
    return '/login';
  }

  if (user.role === 'employee' || (user.role === 'admin' && adminViewMode === 'employee')) {
    return '/employee';
  }

  return '/manager';
}

export function getHomeHref(user: User | null, adminViewMode: AdminViewMode) {
  return getLandingPath(user, adminViewMode);
}

export function getNotificationsHref(user: User | null, adminViewMode: AdminViewMode) {
  if (user?.role === 'employee' || (user?.role === 'admin' && adminViewMode === 'employee')) {
    return '/employee/notifications';
  }

  return '/manager/notifications';
}
