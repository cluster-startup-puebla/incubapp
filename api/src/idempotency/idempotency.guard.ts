import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IDEMPOTENCY_ENABLED_KEY } from './idempotency.decorator.js';
import {
  IDEMPOTENCY_HEADER,
  IDEMPOTENCY_REPLAY,
  IDEMPOTENCY_STORE,
  hashIdempotencyBody,
  idempotencyStoreKey,
  type IdempotencyRecord,
  type IdempotencyStore,
} from './idempotency.store.js';

type RequestLike = {
  body?: unknown;
  user?: { id?: string } | null;
  headers?: Record<string, string | string[] | undefined>;
  [IDEMPOTENCY_REPLAY]?: IdempotencyRecord;
};

function readIdempotencyKey(
  headers: RequestLike['headers'],
): string | undefined {
  const raw = headers?.[IDEMPOTENCY_HEADER] ?? headers?.['Idempotency-Key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Early conflict / replay lookup for handlers marked with
 * {@link RequireIdempotency}. Attaches a cached record on the request when
 * the same key + body was already seen; the interceptor short-circuits.
 */
@Injectable()
export class IdempotencyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(IDEMPOTENCY_STORE) private readonly store: IdempotencyStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const enabled = this.reflector.getAllAndOverride<boolean | undefined>(
      IDEMPOTENCY_ENABLED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!enabled) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestLike>();
    const idempotencyKey = readIdempotencyKey(request.headers);
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const bodyHash = hashIdempotencyBody(request.body);
    const storeKey = idempotencyStoreKey(userId, idempotencyKey);
    const existing = await this.store.get(storeKey);

    if (!existing) {
      return true;
    }

    if (existing.bodyHash !== bodyHash) {
      throw new UnprocessableEntityException(
        'Idempotency-Key was already used with a different request body',
      );
    }

    request[IDEMPOTENCY_REPLAY] = existing;
    return true;
  }
}
