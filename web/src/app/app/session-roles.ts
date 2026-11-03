export type SessionUser = {
  role?: string;
  roles?: string[];
  isSuperAdmin?: boolean;
};

export function rolesFromSession(user: SessionUser | undefined): string[] {
  if (!user) {
    return [];
  }
  const roles = user.roles?.length
    ? [...user.roles]
    : user.role
      ? [user.role]
      : [];
  if (user.isSuperAdmin && !roles.includes('superadmin')) {
    roles.push('superadmin');
  }
  return roles;
}

export function hasRole(roles: string[], allowed: Set<string>): boolean {
  return roles.some((role) => allowed.has(role));
}

const CLUSTER_ROLES = new Set(['superadmin', 'cluster_admin', 'coorganizer']);
const INCUBATOR_ROLES = new Set(['director', 'staff']);

export function portalPath(user: SessionUser | undefined): string {
  const roles = rolesFromSession(user);
  if (
    roles.some((role) => CLUSTER_ROLES.has(role) || INCUBATOR_ROLES.has(role))
  ) {
    return '/app/overview';
  }
  if (roles.includes('founder')) {
    return '/app/mi-startup';
  }
  return '/app/avisos';
}
