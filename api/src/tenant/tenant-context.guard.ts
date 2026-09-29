import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipService } from '../membership/membership.service.js';
import { REQUIRES_TENANT_KEY } from './requires-tenant.decorator.js';
import {
  assertTenantResolved,
  INCUBATOR_HEADER,
  resolveTenantContext,
  type RequestWithTenant,
} from './tenant-context.js';

/**
 * Runs as a global guard after AuthGuard so PermissionsGuard sees roles.
 * Throws only on routes marked @RequiresTenant().
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly memberships: MembershipService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithTenant>();
    const userId = request.user?.id;

    if (!userId) {
      request.tenantIncubatorId = null;
      request.membershipRoles = [];
      request.tenantResolved = true;
      return true;
    }

    const active = await this.memberships.listActive(userId);
    const headerRaw = request.headers?.[INCUBATOR_HEADER];
    const headerValue = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
    const result = resolveTenantContext({
      isSuperAdmin: Boolean(request.user?.isSuperAdmin),
      headerValue,
      activeMemberships: active,
    });

    const requiresTenant =
      this.reflector.getAllAndOverride<boolean>(REQUIRES_TENANT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true;

    if (!result.ok) {
      if (requiresTenant) {
        assertTenantResolved(result);
      }
      request.tenantIncubatorId = null;
      request.membershipRoles = [];
      request.tenantResolved = true;
      return true;
    }

    request.tenantIncubatorId = result.incubatorId;
    request.membershipRoles = result.roles;
    request.tenantResolved = true;
    return true;
  }
}
