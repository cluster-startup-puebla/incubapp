import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import pino, { type Logger } from 'pino';
import { Observable, tap } from 'rxjs';
import { REQUEST_ID_HEADER } from '../common/http/problem-details.filter.js';
import { redact } from './redact.js';

export type RequestLogInput = {
  requestId?: string | null;
  userId?: string | null;
  tenantId?: string | null;
  durationMs: number;
  method?: string;
  path?: string;
  statusCode?: number;
  headers?: Record<string, unknown> | null;
  body?: unknown;
};

export type RequestLogLine = {
  requestId: string;
  userId: string | null;
  tenantId: string | null;
  durationMs: number;
  method?: string;
  path?: string;
  statusCode?: number;
  headers?: unknown;
  body?: unknown;
};

type RequestLike = {
  method?: string;
  originalUrl?: string;
  url?: string;
  path?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  user?: { id?: string } | null;
  tenantIncubatorId?: string | null;
};

type ResponseLike = {
  statusCode?: number;
};

function resolveRequestId(
  headers: RequestLike['headers'],
  fallback?: string | null,
): string {
  if (typeof fallback === 'string' && fallback.trim()) {
    return fallback.trim();
  }
  const raw = headers?.[REQUEST_ID_HEADER] ?? headers?.['x-request-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return randomUUID();
}

/** Builds one JSON-serializable request log object (secrets already redacted). */
export function buildRequestLogLine(input: RequestLogInput): RequestLogLine {
  const line: RequestLogLine = {
    requestId: resolveRequestId(undefined, input.requestId),
    userId: input.userId ?? null,
    tenantId: input.tenantId ?? null,
    durationMs: input.durationMs,
  };

  if (input.method !== undefined) {
    line.method = input.method;
  }
  if (input.path !== undefined) {
    line.path = input.path;
  }
  if (input.statusCode !== undefined) {
    line.statusCode = input.statusCode;
  }
  if (input.headers !== undefined && input.headers !== null) {
    line.headers = redact(input.headers);
  }
  if (input.body !== undefined) {
    line.body = redact(input.body);
  }

  return line;
}

function createDefaultLogger(): Logger {
  return pino({
    name: 'http',
    base: undefined,
  });
}

/**
 * Emits one structured request log line after the handler finishes.
 * Registered globally from AppModule.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger: Logger = createDefaultLogger();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const http = context.switchToHttp();
    const request = http.getRequest<RequestLike>();
    const response = http.getResponse<ResponseLike>();

    return next.handle().pipe(
      tap({
        next: () => {
          this.writeLine(request, response, startedAt);
        },
        error: () => {
          this.writeLine(request, response, startedAt);
        },
      }),
    );
  }

  private writeLine(
    request: RequestLike,
    response: ResponseLike,
    startedAt: number,
  ): void {
    const path = request.originalUrl ?? request.url ?? request.path ?? '';
    const line = buildRequestLogLine({
      requestId: resolveRequestId(request.headers),
      userId: request.user?.id ?? null,
      tenantId: request.tenantIncubatorId ?? null,
      durationMs: Date.now() - startedAt,
      method: request.method,
      path,
      statusCode: response.statusCode,
      headers: request.headers as Record<string, unknown> | undefined,
      body: request.body,
    });
    this.logger.info(line);
  }
}
