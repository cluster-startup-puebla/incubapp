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
