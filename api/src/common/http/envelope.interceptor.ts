import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { isEnvelope, unwrapEnvelope } from './envelope.js';

function isHealthPath(path: string): boolean {
  return (
    path === '/api/v1/health' ||
    path.startsWith('/api/v1/health/') ||
    path === '/health' ||
    path.startsWith('/health/')
  );
}

/**
 * Single place that turns toList/toResource markers into JSON envelopes.
 * Controllers must not build `{ data }` / `{ data, meta }` by hand.
 */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      originalUrl?: string;
      url?: string;
      path?: string;
    }>();
    const path = request.originalUrl ?? request.url ?? request.path ?? '';

    if (isHealthPath(path)) {
      return next.handle();
    }

    return next.handle().pipe(
      map((value: unknown): unknown => {
        if (value === undefined || value === null) {
          return value;
        }
        if (isEnvelope(value)) {
          return unwrapEnvelope(value);
        }
        return value;
      }),
    );
  }
}
