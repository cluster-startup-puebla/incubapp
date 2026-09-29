import {
  ACTIONS,
  canPerform,
  PERMISSION_MATRIX,
  permissionKey,
  RESOURCES,
  ROLES,
  roleHasPermission,
  type Permission,
  type Role,
} from './permissions.js';
import { PermissionsGuard } from './permissions.guard.js';
import { RequirePermissions } from './require-permissions.decorator.js';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';

/**
 * Documented expected matrix: every role × resource:action cell must appear.
 * Adding a role/action without an entry here fails `matriz completa`.
 */
const EXPECTED_MATRIX: Record<Role, Record<Permission, boolean>> = {
  cluster_admin: {
    'startup:list': true,
    'startup:read': true,
    'startup:create': true,
    'startup:update': true,
    'startup:delete': true,
    'institution:list': true,
    'institution:read': true,
    'institution:create': true,
    'institution:update': true,
    'institution:delete': true,
    'membership:list': true,
    'membership:read': true,
    'membership:create': true,
    'membership:update': true,
    'membership:delete': true,
  },
  coorganizer: {
    'startup:list': true,
    'startup:read': true,
    'startup:create': true,
    'startup:update': true,
    'startup:delete': true,
    'institution:list': true,
    'institution:read': true,
    'institution:create': true,
    'institution:update': true,
    'institution:delete': false,
    'membership:list': true,
    'membership:read': true,
    'membership:create': true,
    'membership:update': true,
    'membership:delete': true,
  },
  director: {
    'startup:list': true,
    'startup:read': true,
    'startup:create': true,
    'startup:update': true,
    'startup:delete': true,
    'institution:list': true,
    'institution:read': true,
    'institution:create': false,
    'institution:update': false,
    'institution:delete': false,
    'membership:list': true,
    'membership:read': true,
    'membership:create': true,
    'membership:update': true,
    'membership:delete': true,
  },
  staff: {
    'startup:list': true,
    'startup:read': true,
    'startup:create': true,
    'startup:update': true,
    'startup:delete': false,
    'institution:list': true,
    'institution:read': true,
    'institution:create': false,
    'institution:update': false,
    'institution:delete': false,
    'membership:list': true,
    'membership:read': true,
    'membership:create': false,
    'membership:update': false,
    'membership:delete': false,
  },
  mentor: {
    'startup:list': true,
    'startup:read': true,
    'startup:create': false,
    'startup:update': true,
    'startup:delete': false,
    'institution:list': true,
    'institution:read': true,
    'institution:create': false,
    'institution:update': false,
    'institution:delete': false,
    'membership:list': false,
    'membership:read': false,
    'membership:create': false,
    'membership:update': false,
    'membership:delete': false,
  },
  founder: {
    'startup:list': true,
    'startup:read': true,
    'startup:create': true,
    'startup:update': true,
    'startup:delete': false,
    'institution:list': true,
    'institution:read': true,
    'institution:create': false,
    'institution:update': false,
    'institution:delete': false,
    'membership:list': false,
    'membership:read': false,
    'membership:create': false,
    'membership:update': false,
    'membership:delete': false,
  },
  judge: {
    'startup:list': true,
    'startup:read': true,
    'startup:create': false,
    'startup:update': false,
    'startup:delete': false,
    'institution:list': true,
    'institution:read': true,
    'institution:create': false,
    'institution:update': false,
    'institution:delete': false,
    'membership:list': false,
    'membership:read': false,
    'membership:create': false,
    'membership:update': false,
    'membership:delete': false,
  },
};

describe('permissions matrix', () => {
  it('director crea startup', () => {
    expect(roleHasPermission('director', 'startup:create')).toBe(true);
    expect(
      canPerform({ roles: ['director'], permission: 'startup:create' }),
    ).toBe(true);
  });

  it('mentor borra', () => {
    expect(roleHasPermission('mentor', 'startup:delete')).toBe(false);
    expect(
      canPerform({ roles: ['mentor'], permission: 'startup:delete' }),
    ).toBe(false);
  });

  it('founder edita ajena', () => {
    // Role has startup:update in the abstract matrix…
    expect(roleHasPermission('founder', 'startup:update')).toBe(true);
    // …but ownership policy denies someone else's startup.
    expect(
      canPerform({
        roles: ['founder'],
        permission: 'startup:update',
        actorId: 'founder-1',
        resourceOwnerId: 'other-user',
      }),
    ).toBe(false);
    expect(
      canPerform({
        roles: ['founder'],
        permission: 'startup:update',
        actorId: 'founder-1',
        resourceOwnerId: 'founder-1',
      }),
    ).toBe(true);
  });

  it('matriz completa', () => {
    for (const role of ROLES) {
      expect(EXPECTED_MATRIX[role]).toBeDefined();
      for (const resource of RESOURCES) {
        for (const action of ACTIONS) {
          const key = permissionKey(resource, action);
          const expected = EXPECTED_MATRIX[role][key];
          expect(expected).toBeDefined();
          expect(PERMISSION_MATRIX[role][key]).toBe(expected);
        }
      }
    }

    // Fail if PERMISSION_MATRIX gained a cell with no expected value.
    for (const role of Object.keys(PERMISSION_MATRIX) as Role[]) {
      expect(EXPECTED_MATRIX[role]).toBeDefined();
      for (const key of Object.keys(PERMISSION_MATRIX[role]) as Permission[]) {
        expect(EXPECTED_MATRIX[role][key]).toBeDefined();
      }
    }
  });

  it('guard niega sin permiso', () => {
    class Fixture {
      @RequirePermissions('startup:delete')
      handler(this: void) {
        return true;
      }
    }
    const reflector = new Reflector();
    const guard = new PermissionsGuard(reflector);
    const handler = Fixture.prototype.handler;
    const context = {
      getHandler: () => handler,
      getClass: () => Fixture,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'u1', isSuperAdmin: false },
          membershipRoles: ['mentor'],
        }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('guard permite director create', () => {
    class Fixture {
      @RequirePermissions('startup:create')
      handler(this: void) {
        return true;
      }
    }
    const reflector = new Reflector();
    const guard = new PermissionsGuard(reflector);
    const handler = Fixture.prototype.handler;
    const context = {
      getHandler: () => handler,
      getClass: () => Fixture,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'u1', isSuperAdmin: false },
          membershipRoles: ['director'],
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });
});
