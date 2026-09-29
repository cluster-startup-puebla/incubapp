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

export const RESOURCES = [
  'startup',
  'institution',
  'incubator',
  'membership',
  'user',
  'geo-unit',
  'framework',
] as const;
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

/** Users: managers list/read; no direct create (invite via membership). */
const USER_MANAGER = {
  'user:list': true,
  'user:read': true,
  'user:create': false,
  'user:update': false,
  'user:delete': false,
  'user:restore': false,
  'user:purge': false,
} as const;

const USER_DENIED = {
  'user:list': false,
  'user:read': false,
  'user:create': false,
  'user:update': false,
  'user:delete': false,
  'user:restore': false,
  'user:purge': false,
} as const;

/** Read/list for every authenticated role; writes only via isSuperAdmin bypass. */
const GEO_UNIT_READ_ONLY = {
  'geo-unit:list': true,
  'geo-unit:read': true,
  'geo-unit:create': false,
  'geo-unit:update': false,
  'geo-unit:delete': false,
  'geo-unit:restore': false,
  'geo-unit:purge': false,
} as const;

/**
 * Framework writers (draft CRUD). Publish/clone additionally require
 * cluster_admin or super admin in the service.
 */
const FRAMEWORK_WRITER = {
  'framework:list': true,
  'framework:read': true,
  'framework:create': true,
  'framework:update': true,
  'framework:delete': true,
  'framework:restore': true,
  'framework:purge': false,
} as const;

/** Directors and operators may list/read published frameworks. */
const FRAMEWORK_READ_ONLY = {
  'framework:list': true,
  'framework:read': true,
  'framework:create': false,
  'framework:update': false,
  'framework:delete': false,
  'framework:restore': false,
  'framework:purge': false,
} as const;

/** Incubator tenant-root permissions (scope enforced in service, not TENANT_MODELS). */
const INCUBATOR_CLUSTER_ADMIN = {
  'incubator:list': true,
  'incubator:read': true,
  'incubator:create': true,
  'incubator:update': true,
  'incubator:delete': true,
  'incubator:restore': true,
  'incubator:purge': false,
} as const;

const INCUBATOR_COORGANIZER = {
  'incubator:list': true,
  'incubator:read': true,
  'incubator:create': true,
  'incubator:update': true,
  'incubator:delete': true,
  'incubator:restore': true,
  'incubator:purge': false,
} as const;

const INCUBATOR_DIRECTOR = {
  'incubator:list': true,
  'incubator:read': true,
  'incubator:create': false,
  'incubator:update': true,
  'incubator:delete': true,
  'incubator:restore': false,
  'incubator:purge': false,
} as const;

const INCUBATOR_STAFF = {
  'incubator:list': true,
  'incubator:read': true,
  'incubator:create': false,
  'incubator:update': true,
  'incubator:delete': false,
  'incubator:restore': false,
  'incubator:purge': false,
} as const;

const INCUBATOR_READ_ONLY = {
  'incubator:list': true,
  'incubator:read': true,
  'incubator:create': false,
  'incubator:update': false,
  'incubator:delete': false,
  'incubator:restore': false,
  'incubator:purge': false,
} as const;

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
    ...INCUBATOR_CLUSTER_ADMIN,
    'membership:list': true,
    'membership:read': true,
    'membership:create': true,
    'membership:update': true,
    'membership:delete': true,
    'membership:restore': true,
    'membership:purge': false,
    ...USER_MANAGER,
    ...GEO_UNIT_READ_ONLY,
    ...FRAMEWORK_WRITER,
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
    ...INCUBATOR_COORGANIZER,
    'membership:list': true,
    'membership:read': true,
    'membership:create': true,
    'membership:update': true,
    'membership:delete': true,
    'membership:restore': true,
    'membership:purge': false,
    ...USER_MANAGER,
    ...GEO_UNIT_READ_ONLY,
    ...FRAMEWORK_WRITER,
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
    ...INCUBATOR_DIRECTOR,
    'membership:list': true,
    'membership:read': true,
    'membership:create': true,
    'membership:update': true,
    'membership:delete': true,
    'membership:restore': true,
    'membership:purge': false,
    ...USER_MANAGER,
    ...GEO_UNIT_READ_ONLY,
    ...FRAMEWORK_READ_ONLY,
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
    ...INCUBATOR_STAFF,
    'membership:list': true,
    'membership:read': true,
    'membership:create': false,
    'membership:update': false,
    'membership:delete': false,
    'membership:restore': false,
    'membership:purge': false,
    ...USER_MANAGER,
    ...GEO_UNIT_READ_ONLY,
    ...FRAMEWORK_READ_ONLY,
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
    ...INCUBATOR_READ_ONLY,
    'membership:list': false,
    'membership:read': false,
    'membership:create': false,
    'membership:update': false,
    'membership:delete': false,
    'membership:restore': false,
    'membership:purge': false,
    ...USER_DENIED,
    ...GEO_UNIT_READ_ONLY,
    ...FRAMEWORK_READ_ONLY,
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
    ...INCUBATOR_READ_ONLY,
    'membership:list': false,
    'membership:read': false,
    'membership:create': false,
    'membership:update': false,
    'membership:delete': false,
    'membership:restore': false,
    'membership:purge': false,
    ...USER_DENIED,
    ...GEO_UNIT_READ_ONLY,
    ...FRAMEWORK_READ_ONLY,
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
    ...INCUBATOR_READ_ONLY,
    'membership:list': false,
    'membership:read': false,
    'membership:create': false,
    'membership:update': false,
    'membership:delete': false,
    'membership:restore': false,
    'membership:purge': false,
    ...USER_DENIED,
    ...GEO_UNIT_READ_ONLY,
    ...FRAMEWORK_READ_ONLY,
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
    // Omitted resourceOwnerId → permission matrix only; service enforces
    // founder ownership as 404. Explicit null/string uses matrix deny.
    if (input.resourceOwnerId !== undefined) {
      if (
        input.resourceOwnerId === null ||
        input.actorId == null ||
        input.resourceOwnerId !== input.actorId
      ) {
        return false;
      }
    }
  }

  return true;
}
