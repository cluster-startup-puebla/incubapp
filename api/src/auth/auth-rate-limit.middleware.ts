import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  AuthRateLimiter,
  AUTH_RATE_LIMIT_MAX_FAILURES,
} from './auth-rate-limit.js';

const RATE_LIMITED_SUFFIXES = [
  '/sign-in/email',
  '/sign-up/email',
  '/request-password-reset',
];

export type AuthRateLimitMiddleware = (
  req: IncomingMessage & {
    body?: unknown;
    originalUrl?: string;
    url?: string;
    ip?: string;
  },
  res: ServerResponse & {
    status?: (code: number) => ServerResponse;
    setHeader: (name: string, value: string | number) => void;
    json?: (body: unknown) => void;
    end: (chunk?: unknown) => void;
  },
  next: (error?: unknown) => void,
) => void | Promise<void>;

function requestPath(
  req: IncomingMessage & { originalUrl?: string; url?: string },
): string {
  const raw = req.originalUrl ?? req.url ?? '';
  return raw.split('?')[0] ?? '';
}

function isRateLimitedPath(path: string): boolean {
  return RATE_LIMITED_SUFFIXES.some(
    (suffix) => path === `/api/auth${suffix}` || path.endsWith(suffix),
  );
}

function readEmail(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const email = (body as { email?: unknown }).email;
  return typeof email === 'string' && email.trim().length > 0
    ? email.trim()
    : undefined;
}

function readIp(req: IncomingMessage & { ip?: string }): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]?.trim() || 'unknown';
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) {
    return realIp;
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Custom auth limiter (T2.7): 5 failures / 15 min by IP + email on login,
 * register, and reset. Distinct from Better Auth's built-in global window.
 */
export function createAuthRateLimitMiddleware(
  limiter: AuthRateLimiter,
): AuthRateLimitMiddleware {
  return async (req, res, next) => {
    const path = requestPath(req);
    if (!isRateLimitedPath(path)) {
      next();
      return;
    }

    const email = readEmail(req.body);
    if (!email) {
      next();
      return;
    }

    const ip = readIp(req);
    const decision = await limiter.check(ip, email);
    if (!decision.allowed) {
      res.statusCode = 429;
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          message: 'Too many attempts. Try again later.',
          code: 'TOO_MANY_REQUESTS',
        }),
      );
      return;
    }

    const originalEnd = res.end.bind(res);
    let recorded = false;

    res.end = ((chunk?: unknown, encoding?: unknown, cb?: unknown) => {
      if (!recorded && res.statusCode >= 400 && res.statusCode !== 429) {
        recorded = true;
        void limiter.recordFailure(ip, email);
      }
      // request-password-reset returns 200 even for unknown emails; still count
      // as a failure attempt so reset cannot be used to spray mail / probe.
      if (
        !recorded &&
        path.endsWith('/request-password-reset') &&
        res.statusCode < 400
      ) {
        recorded = true;
        void limiter.recordFailure(ip, email);
      }
      return originalEnd(chunk as never, encoding as never, cb as never);
    }) as typeof res.end;

    next();
  };
}

export { AUTH_RATE_LIMIT_MAX_FAILURES };
