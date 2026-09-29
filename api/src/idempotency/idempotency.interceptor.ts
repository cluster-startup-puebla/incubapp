import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { IDEMPOTENCY_ENABLED_KEY } from './idempotency.decorator.js';
import {
  IDEMPOTENCY_HEADER,
  IDEMPOTENCY_REPLAY,
  IDEMPOTENCY_STORE,
  IDEMPOTENCY_TTL_SECONDS,
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

type ResponseLike = {
  statusCode?: number;
  status: (code: number) => void;
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
 * When a handler is marked with {@link RequireIdempotency}, replays or
 * records responses keyed by user id + Idempotency-Key (Redis TTL 24h).
 * Same key + different body → 422. Controllers opt in via the decorator;
 * pair with {@link IdempotencyGuard} for early conflict detection.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(IDEMPOTENCY_STORE) private readonly store: IdempotencyStore,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const enabled = this.reflector.getAllAndOverride<boolean | undefined>(
      IDEMPOTENCY_ENABLED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!enabled) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestLike>();
    const response = http.getResponse<ResponseLike>();

    const replay = request[IDEMPOTENCY_REPLAY];
    if (replay) {
      response.status(replay.statusCode);
      return of(replay.body);
    }

    const idempotencyKey = readIdempotencyKey(request.headers);
    if (!idempotencyKey) {
      return throwError(
        () => new BadRequestException('Idempotency-Key header is required'),
      );
    }

    const userId = request.user?.id;
    if (!userId) {
      return throwError(
        () => new UnauthorizedException('Authentication required'),
      );
    }

    const bodyHash = hashIdempotencyBody(request.body);
    const storeKey = idempotencyStoreKey(userId, idempotencyKey);

    return from(this.store.get(storeKey)).pipe(
      switchMap((existing) => {
        if (existing) {
          if (existing.bodyHash !== bodyHash) {
            return throwError(
              () =>
                new UnprocessableEntityException(
                  'Idempotency-Key was already used with a different request body',
                ),
            );
          }
          response.status(existing.statusCode);
          return of(existing.body);
        }

        return next.handle().pipe(
          switchMap((body: unknown) => {
            const statusCode = response.statusCode ?? 201;
            return from(
              this.store
                .set(
                  storeKey,
                  { bodyHash, statusCode, body },
                  IDEMPOTENCY_TTL_SECONDS,
                )
                .then(() => body),
            );
          }),
        );
      }),
      catchError((error: unknown) => {
        if (error instanceof Error) {
          return throwError(() => error);
        }
        return throwError(() => new Error(String(error)));
      }),
    );
  }
}
