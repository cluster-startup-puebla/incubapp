import { ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { TenantContextGuard } from './tenant-context.guard.js';
import { REQUIRES_TENANT_KEY } from './requires-tenant.decorator.js';
import type { MembershipService } from '../membership/membership.service.js';
import type { RequestWithTenant } from './tenant-context.js';

function guardWith(listActive: MembershipService['listActive']) {
  return new TenantContextGuard(
    { listActive } as MembershipService,
    new Reflector(),
  );
}

function contextFor(
  request: RequestWithTenant,
  handler: () => void,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('TenantContextGuard', () => {
  it('sin membresia permite sesiones', async () => {
    const request: RequestWithTenant = {
      user: { id: 'user-a', isSuperAdmin: false },
      headers: {},
    } as RequestWithTenant;
    const ok = await guardWith(() => Promise.resolve([])).canActivate(
      contextFor(request, () => undefined),
    );
    expect(ok).toBe(true);
    expect(request.tenantIncubatorId).toBeNull();
    expect(request.tenantResolved).toBe(true);
  });

  it('ruta de tenant sin membresia es 403', async () => {
    const request: RequestWithTenant = {
      user: { id: 'user-a', isSuperAdmin: false },
      headers: {},
    } as RequestWithTenant;
    const handler = () => undefined;
    SetMetadata(REQUIRES_TENANT_KEY, true)(handler);

    await expect(
      guardWith(() => Promise.resolve([])).canActivate(
        contextFor(request, handler),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(request.tenantIncubatorId).toBeUndefined();
  });
});
