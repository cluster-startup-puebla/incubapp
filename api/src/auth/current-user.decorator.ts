import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export type AuthenticatedUser = {
  id: string;
  email?: string;
  name?: string;
  isSuperAdmin?: boolean;
  emailVerified?: boolean;
  [key: string]: unknown;
};

export function resolveCurrentUser(
  request: { user?: AuthenticatedUser | null } | undefined,
): AuthenticatedUser | undefined {
  return request?.user ?? undefined;
}

/**
 * Current authenticated user from AuthGuard (`request.user`).
 * Public/anonymous routes with no session resolve to `undefined` (no throw).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    return resolveCurrentUser(
      ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser | null }>(),
    );
  },
);
