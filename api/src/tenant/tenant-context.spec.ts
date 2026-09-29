import {
  assertTenantResolved,
  resolveTenantContext,
} from './tenant-context.js';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  currentIncubatorId,
  runWithRequestContext,
} from '../context/request-context.js';

const INC_A = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';
const INC_B = 'bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb';

function membership(
  scopeId: string,
  role: 'director' | 'cluster_admin' | 'mentor' = 'director',
) {
  return {
    scopeType: 'incubator' as const,
    scopeId,
    role,
    validFrom: new Date(0),
    validTo: null,
    deletedAt: null,
  };
}

describe('resolveTenantContext', () => {
  it('header valido', () => {
    const result = resolveTenantContext({
      isSuperAdmin: false,
      headerValue: INC_A,
      activeMemberships: [membership(INC_A)],
    });
    expect(result).toEqual({
      ok: true,
      incubatorId: INC_A,
      roles: ['director'],
    });
  });

  it('header ajeno', () => {
    const result = resolveTenantContext({
      isSuperAdmin: false,
      headerValue: INC_B,
      activeMemberships: [membership(INC_A)],
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      message: 'Not a member of this incubator',
    });

    // ALS must NOT be set to the foreign id when resolution fails.
    let seen: string | null = 'unset';
    try {
      assertTenantResolved(result);
    } catch {
      seen = currentIncubatorId();
    }
    expect(seen).toBeNull();
  });

  it('uuid mal formado', () => {
    const result = resolveTenantContext({
      isSuperAdmin: false,
      headerValue: 'not-a-uuid',
      activeMemberships: [membership(INC_A)],
    });
    expect(result).toEqual({
      ok: false,
      status: 400,
      message: 'Invalid X-Incubator-Id',
    });
    expect(() => assertTenantResolved(result)).toThrow(BadRequestException);
  });

  it('una sola membresia', () => {
    const result = resolveTenantContext({
      isSuperAdmin: false,
      headerValue: undefined,
      activeMemberships: [membership(INC_A)],
    });
    expect(result).toEqual({
      ok: true,
      incubatorId: INC_A,
      roles: ['director'],
    });
  });

  it('cero membresias', () => {
    const result = resolveTenantContext({
      isSuperAdmin: false,
      headerValue: undefined,
      activeMemberships: [],
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      message: 'No active incubator membership',
    });
    expect(() => assertTenantResolved(result)).toThrow(ForbiddenException);
  });

  it('super admin omite', () => {
    const result = resolveTenantContext({
      isSuperAdmin: true,
      headerValue: undefined,
      activeMemberships: [],
    });
    expect(result).toEqual({
      ok: true,
      incubatorId: null,
      roles: [],
    });
  });

  it('cluster_admin omite', () => {
    const result = resolveTenantContext({
      isSuperAdmin: false,
      headerValue: undefined,
      activeMemberships: [membership(INC_A, 'cluster_admin')],
    });
    expect(result).toEqual({
      ok: true,
      incubatorId: null,
      roles: ['cluster_admin'],
    });
  });

  it('header ajeno no escribe ALS', () => {
    const foreign = resolveTenantContext({
      isSuperAdmin: false,
      headerValue: INC_B,
      activeMemberships: [membership(INC_A)],
    });
    expect(foreign.ok).toBe(false);

    const inside = runWithRequestContext(
      {
        userId: 'u1',
        incubatorId: INC_A,
        isSuperAdmin: false,
        actorId: 'u1',
      },
      () => currentIncubatorId(),
    );
    expect(inside).toBe(INC_A);
    // Failed resolution never ran with INC_B in ALS.
    expect(currentIncubatorId()).toBeNull();
  });
});
