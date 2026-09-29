import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { canPerform, type Permission } from './permissions.js';
import { REQUIRE_PERMISSIONS_KEY } from './require-permissions.decorator.js';

type RequestWithAuthz = {
  user?: { id?: string; isSuperAdmin?: boolean } | null;
  membershipRoles?: string[];
  /** Optional resource owner for founder ownership checks. */
  resourceOwnerId?: string | null;
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuthz>();
    const roles = request.membershipRoles ?? [];
    const isSuperAdmin = Boolean(request.user?.isSuperAdmin);
    const actorId = request.user?.id ?? null;

    const allowed = required.every((permission) =>
      canPerform({
        roles,
        permission,
        isSuperAdmin,
        actorId,
        resourceOwnerId: request.resourceOwnerId,
      }),
    );

    if (!allowed) {
      throw new ForbiddenException('Missing required permission');
    }
    return true;
  }
}
