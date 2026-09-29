/**
 * Single role → resource:action map. Guards and policies must consult this file
 * only — no `if (role === 'director')` branches outside the matrix lookup.
 */

export const ROLES = [
  'cluster_admin',
  'coorganizer',
  'director',
  'staff',
  'mentor',
  'founder',
  'judge',
] as const;

export type Role = (typeof ROLES)[number];

export const RESOURCES = ['startup', 'institution', 'membership'] as const;
export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = [
  'list',
  'read',
  'create',
  'update',
  'delete',
  'restore',
  'purge',
] as const;
export type Action = (typeof ACTIONS)[number];

export type Permission = `${Resource}:${Action}`;

export function permissionKey(resource: Resource, action: Action): Permission {
  return `${resource}:${action}`;
}

/** Explicit allow (true) / deny (false) for every role × permission cell. */
export const PERMISSION_MATRIX: Record<Role, Record<Permission, boolean>> = {
  cluster_admin: {
    'startup:list': true,
    'startup:read': true,
    'startup:create': true,
    'startup:update': true,
    'startup:delete': true,
    'startup:restore': true,
    'startup:purge': false,
    'institution:list': true,
    'institution:read': true,
    'institution:create': true,
    'institution:update': true,
    'institution:delete': true,
    'institution:restore': true,
    'institution:purge': false,
    'membership:list': true,
    'membership:read': true,
    'membership:create': true,
    'membership:update': true,
    'membership:delete': true,
    'membership:restore': true,
    'membership:purge': false,
  },
  coorganizer: {
    'startup:list': true,
    'startup:read': true,
    'startup:create': true,
    'startup:update': true,
    'startup:delete': true,
    'startup:restore': true,
    'startup:purge': false,
    'institution:list': true,
    'institution:read': true,
    'institution:create': true,
    'institution:update': true,
    'institution:delete': false,
    'institution:restore': false,
    'institution:purge': false,
    'membership:list': true,
    'membership:read': true,
    'membership:create': true,
    'membership:update': true,
    'membership:delete': true,
    'membership:restore': true,
    'membership:purge': false,
  },
  director: {
    'startup:list': true,
    'startup:read': true,
    'startup:create': true,
    'startup:update': true,
    'startup:delete': true,
    'startup:restore': true,
    'startup:purge': false,
    'institution:list': true,
    'institution:read': true,
    'institution:create': false,
    'institution:update': false,
    'institution:delete': false,
    'institution:restore': false,
    'institution:purge': false,
    'membership:list': true,
    'membership:read': true,
    'membership:create': true,
    'membership:update': true,
    'membership:delete': true,
    'membership:restore': true,
    'membership:purge': false,
  },
  staff: {
    'startup:list': true,
    'startup:read': true,
    'startup:create': true,
    'startup:update': true,
    'startup:delete': false,
    'startup:restore': false,
    'startup:purge': false,
    'institution:list': true,
    'institution:read': true,
    'institution:create': false,
    'institution:update': false,
    'institution:delete': false,
    'institution:restore': false,
    'institution:purge': false,
    'membership:list': true,
    'membership:read': true,
    'membership:create': false,
    'membership:update': false,
    'membership:delete': false,
    'membership:restore': false,
    'membership:purge': false,
  },
  mentor: {
    'startup:list': true,
    'startup:read': true,
    'startup:create': false,
    'startup:update': true,
    'startup:delete': false,
    'startup:restore': false,
    'startup:purge': false,
    'institution:list': true,
    'institution:read': true,
    'institution:create': false,
    'institution:update': false,
    'institution:delete': false,
    'institution:restore': false,
    'institution:purge': false,
    'membership:list': false,
    'membership:read': false,
    'membership:create': false,
    'membership:update': false,
    'membership:delete': false,
    'membership:restore': false,
    'membership:purge': false,
  },
  founder: {
    'startup:list': true,
    'startup:read': true,
    'startup:create': true,
    'startup:update': true,
    'startup:delete': false,
    'startup:restore': false,
    'startup:purge': false,
    'institution:list': true,
    'institution:read': true,
    'institution:create': false,
    'institution:update': false,
    'institution:delete': false,
    'institution:restore': false,
    'institution:purge': false,
    'membership:list': false,
    'membership:read': false,
    'membership:create': false,
    'membership:update': false,
    'membership:delete': false,
    'membership:restore': false,
    'membership:purge': false,
  },
  judge: {
    'startup:list': true,
    'startup:read': true,
    'startup:create': false,
    'startup:update': false,
    'startup:delete': false,
    'startup:restore': false,
    'startup:purge': false,
    'institution:list': true,
    'institution:read': true,
    'institution:create': false,
    'institution:update': false,
    'institution:delete': false,
    'institution:restore': false,
    'institution:purge': false,
    'membership:list': false,
    'membership:read': false,
    'membership:create': false,
    'membership:update': false,
    'membership:delete': false,
    'membership:restore': false,
    'membership:purge': false,
  },
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  const row = PERMISSION_MATRIX[role];
  if (!row || row[permission] === undefined) {
    return false;
  }
  return row[permission];
}

export function anyRoleHasPermission(
  roles: readonly string[],
  permission: Permission,
): boolean {
  return roles.some(
    (role) =>
      (ROLES as readonly string[]).includes(role) &&
      roleHasPermission(role as Role, permission),
  );
}

export type CanPerformInput = {
  roles: readonly string[];
  permission: Permission;
  isSuperAdmin?: boolean;
  /** When set, founder may only act on resources they own. */
  resourceOwnerId?: string | null;
  actorId?: string | null;
};

/**
 * Matrix lookup plus ownership policy for founder.
 * Ownership is not encoded as `if (role === 'director')` — only founder ownership.
 * Super admin bypasses the matrix (including purge).
 */
export function canPerform(input: CanPerformInput): boolean {
  if (input.isSuperAdmin) {
    return true;
  }

  if (!anyRoleHasPermission(input.roles, input.permission)) {
    return false;
  }

  const isOwnerScoped =
    input.permission === 'startup:update' ||
    input.permission === 'startup:delete' ||
    input.permission === 'startup:restore';

  if (
    isOwnerScoped &&
    input.roles.includes('founder') &&
    !input.roles.some(
      (r) =>
        r === 'director' ||
        r === 'staff' ||
        r === 'coorganizer' ||
        r === 'cluster_admin' ||
        r === 'mentor',
    )
  ) {
    if (
      input.resourceOwnerId == null ||
      input.actorId == null ||
      input.resourceOwnerId !== input.actorId
    ) {
      return false;
    }
  }

  return true;
}
