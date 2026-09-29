import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, type Subscription } from 'rxjs';
import { runWithRequestContext } from '../context/request-context.js';
import { MembershipService } from '../membership/membership.service.js';
import { REQUIRES_TENANT_KEY } from '../tenant/requires-tenant.decorator.js';
import {
  assertTenantResolved,
  INCUBATOR_HEADER,
  resolveTenantContext,
  type RequestWithTenant,
} from '../tenant/tenant-context.js';

/**
 * Populates the shared AsyncLocalStorage after AuthGuard attaches the user.
 * Resolves X-Incubator-Id into the same store (no second ALS).
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(
    private readonly memberships: MembershipService,
    private readonly reflector: Reflector = new Reflector(),
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<RequestWithTenant>();
    const userId = request.user?.id ?? null;
    const isSuperAdmin = Boolean(request.user?.isSuperAdmin);

    let incubatorId: string | null = null;
    let roles: string[] = [];

    if (userId) {
      if (request.tenantResolved) {
        incubatorId = request.tenantIncubatorId ?? null;
        roles = request.membershipRoles ?? [];
      } else {
        const active = await this.memberships.listActive(userId);
        const headerRaw = request.headers?.[INCUBATOR_HEADER];
        const headerValue = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
        const result = resolveTenantContext({
          isSuperAdmin,
          headerValue,
          activeMemberships: active,
        });
        const requiresTenant = this.routeRequiresTenant(context);
        if (!result.ok) {
          if (requiresTenant) {
            assertTenantResolved(result);
          }
        } else {
          incubatorId = result.incubatorId;
          roles = result.roles;
        }
      }
    }

    request.tenantIncubatorId = incubatorId;
    request.membershipRoles = roles;
    request.tenantResolved = true;

    return new Observable((subscriber) => {
      let subscription: Subscription | undefined;
      runWithRequestContext(
        {
          userId,
          incubatorId,
          isSuperAdmin,
          actorId: userId,
        },
        () => {
          subscription = next.handle().subscribe(subscriber);
        },
      );
      return () => {
        subscription?.unsubscribe();
      };
    });
  }

  private routeRequiresTenant(context: ExecutionContext): boolean {
    if (
      typeof context.getHandler !== 'function' ||
      typeof context.getClass !== 'function'
    ) {
      return false;
    }
    return (
      this.reflector.getAllAndOverride<boolean>(REQUIRES_TENANT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }
}
