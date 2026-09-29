import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Membership } from '../generated/prisma/client.js';
import { MembershipService } from '../membership/membership.service.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const INCUBATOR_HEADER = 'x-incubator-id';

export type ActiveMembershipView = Pick<
  Membership,
  'scopeType' | 'scopeId' | 'role' | 'validFrom' | 'validTo' | 'deletedAt'
>;

export type TenantResolveInput = {
  isSuperAdmin: boolean;
  headerValue: string | undefined;
  activeMemberships: ActiveMembershipView[];
};

export type TenantResolveOk = {
  ok: true;
  incubatorId: string | null;
  roles: string[];
};

export type TenantResolveErr = {
  ok: false;
  status: 400 | 403;
  message: string;
};

export type TenantResolveResult = TenantResolveOk | TenantResolveErr;

function incubatorMemberships(memberships: ActiveMembershipView[]) {
  return memberships.filter((m) => m.scopeType === 'incubator');
}

function hasClusterAdmin(memberships: ActiveMembershipView[]): boolean {
  return memberships.some((m) => m.role === 'cluster_admin');
}

/**
 * Pure tenant resolution. Never mutates ALS — callers set context only on ok.
 */
export function resolveTenantContext(
  input: TenantResolveInput,
): TenantResolveResult {
  const { isSuperAdmin, headerValue, activeMemberships } = input;
  const incubators = incubatorMemberships(activeMemberships);
  const canOmit = isSuperAdmin || hasClusterAdmin(activeMemberships);
  const roles = [...new Set(activeMemberships.map((m) => m.role))];

  if (headerValue !== undefined && headerValue !== '') {
    if (!UUID_RE.test(headerValue)) {
      return { ok: false, status: 400, message: 'Invalid X-Incubator-Id' };
    }

    const member = incubators.some((m) => m.scopeId === headerValue);
    if (!member && !isSuperAdmin && !hasClusterAdmin(activeMemberships)) {
      // Foreign incubator: do not set ALS to this id (caller must not).
      return {
        ok: false,
        status: 403,
        message: 'Not a member of this incubator',
      };
    }

    // Super admin / cluster_admin may use any header as explicit tenant.
    return { ok: true, incubatorId: headerValue, roles };
  }

  if (canOmit) {
    return { ok: true, incubatorId: null, roles };
  }

  if (incubators.length === 0) {
    return {
      ok: false,
      status: 403,
      message: 'No active incubator membership',
    };
  }

  if (incubators.length === 1) {
    return { ok: true, incubatorId: incubators[0].scopeId, roles };
  }

  return {
    ok: false,
    status: 400,
    message: 'X-Incubator-Id required when multiple memberships',
  };
}

export function assertTenantResolved(
  result: TenantResolveResult,
): asserts result is TenantResolveOk {
  if (result.ok) {
    return;
  }
  if (result.status === 400) {
    throw new BadRequestException(result.message);
  }
  throw new ForbiddenException(result.message);
}

export type RequestWithTenant = Request & {
  user?: {
    id?: string;
    isSuperAdmin?: boolean;
  } | null;
  tenantIncubatorId?: string | null;
  membershipRoles?: string[];
  /** Set only after successful resolution; foreign ids never land here. */
  tenantResolved?: boolean;
};

/**
 * Optional Nest middleware for HTTP paths that need tenant resolution.
 * Prefer RequestContextInterceptor for ALS population in the request pipeline.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly memberships: MembershipService) {}

  async use(req: RequestWithTenant, _res: Response, next: NextFunction) {
    const user = req.user;
    if (!user?.id) {
      req.tenantIncubatorId = null;
      req.membershipRoles = [];
      req.tenantResolved = true;
      next();
      return;
    }

    const active = await this.memberships.listActive(user.id);
    const headerRaw = req.headers[INCUBATOR_HEADER];
    const headerValue = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;

    const result = resolveTenantContext({
      isSuperAdmin: Boolean(user.isSuperAdmin),
      headerValue,
      activeMemberships: active,
    });
    assertTenantResolved(result);

    req.tenantIncubatorId = result.incubatorId;
    req.membershipRoles = result.roles;
    req.tenantResolved = true;
    next();
  }
}
