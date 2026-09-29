import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { REQUEST_ID_HEADER } from '../common/http/problem-details.filter.js';
import { ENVELOPE_KIND, isEnvelope } from '../common/http/envelope.js';
import { AuditLogService } from './audit-log.service.js';

export const AUDIT_RESOURCE_KEY = 'audit:resource';

/** Marks a controller/handler as audited for the given resource name. */
export function AuditResource(resource: string) {
  return SetMetadata(AUDIT_RESOURCE_KEY, resource);
}

type RequestLike = {
  method?: string;
  originalUrl?: string;
  url?: string;
  params?: Record<string, string>;
  user?: { id?: string } | null;
  headers?: Record<string, string | string[] | undefined>;
  /** Populated by services that load the prior row for PATCH/DELETE/restore. */
  auditBefore?: unknown;
};

function resolveRequestId(headers: RequestLike['headers']): string | null {
  const raw = headers?.[REQUEST_ID_HEADER] ?? headers?.['x-request-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveAction(method: string, path: string): string | null {
  const upper = method.toUpperCase();
  if (path.includes('/restore')) {
    return 'restore';
  }
  if (path.includes('/purge')) {
    return 'purge';
  }
  if (upper === 'POST') {
    return 'create';
  }
  if (upper === 'PATCH' || upper === 'PUT') {
    return 'update';
  }
  if (upper === 'DELETE') {
    return 'delete';
  }
  return null;
}

function unwrapBody(value: unknown): unknown {
  if (isEnvelope(value)) {
    if (value[ENVELOPE_KIND] === 'resource') {
      return value.data;
    }
    if (value[ENVELOPE_KIND] === 'empty') {
      return null;
    }
    return value.data;
  }
  if (
    value &&
    typeof value === 'object' &&
    'data' in value &&
    !('meta' in value)
  ) {
    return value.data;
  }
  return value;
}

function resourceIdFrom(request: RequestLike, body: unknown): string | null {
  if (request.params?.id) {
    return request.params.id;
  }
  if (
    body &&
    typeof body === 'object' &&
    'id' in body &&
    typeof body.id === 'string'
  ) {
    return (body as { id: string }).id;
  }
  return null;
}

/**
 * Writes an audit_log row after successful POST/PATCH/DELETE/restore/purge.
 * A thrown handler never leaves a success row.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const resource = this.reflector.getAllAndOverride<string | undefined>(
      AUDIT_RESOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!resource) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestLike>();
    const path = request.originalUrl ?? request.url ?? '';
    const action = resolveAction(request.method ?? '', path);
    if (!action) {
      return next.handle();
    }

    const before = request.auditBefore ?? null;

    return next.handle().pipe(
      switchMap((result: unknown) => {
        const afterBody =
          action === 'delete' || action === 'purge' ? null : unwrapBody(result);
        const resourceId = resourceIdFrom(request, afterBody);

        return from(
          this.audit
            .record({
              actorId: request.user?.id ?? null,
              action,
              resource,
              resourceId,
              before,
              after: afterBody,
              requestId: resolveRequestId(request.headers),
            })
            .then((): unknown => result),
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
