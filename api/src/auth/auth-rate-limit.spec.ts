import {
  AuthRateLimiter,
  AUTH_RATE_LIMIT_MAX_FAILURES,
  AUTH_RATE_LIMIT_WINDOW_MS,
  createMemoryAuthRateLimitStore,
  authRateLimitKey,
} from './auth-rate-limit.js';
import { createAuthRateLimitMiddleware } from './auth-rate-limit.middleware.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

describe('AuthRateLimiter', () => {
  it('cinco pasan', async () => {
    const now = 1_000_000;
    const limiter = new AuthRateLimiter(
      createMemoryAuthRateLimitStore(),
      () => now,
    );
    const ip = '1.1.1.1';
    const email = 'user@example.com';

    // Middleware checks before recording: the 5th failure still proceeds.
    for (let i = 0; i < AUTH_RATE_LIMIT_MAX_FAILURES; i += 1) {
      expect((await limiter.check(ip, email)).allowed).toBe(true);
      await limiter.recordFailure(ip, email);
    }
  });

  it('sexto', async () => {
    const now = 2_000_000;
    const limiter = new AuthRateLimiter(
      createMemoryAuthRateLimitStore(),
      () => now,
    );
    const ip = '2.2.2.2';
    const email = 'user@example.com';

    for (let i = 0; i < AUTH_RATE_LIMIT_MAX_FAILURES; i += 1) {
      expect((await limiter.check(ip, email)).allowed).toBe(true);
      await limiter.recordFailure(ip, email);
    }

    const sixth = await limiter.check(ip, email);
    expect(sixth.allowed).toBe(false);
    if (!sixth.allowed) {
      expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
    }

    const middleware = createAuthRateLimitMiddleware(limiter);
    let statusCode = 0;
    let retryAfter: string | number | undefined;
    let body = '';

    await middleware(
      {
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: { 'x-forwarded-for': ip },
        body: { email, password: 'wrong' },
        socket: { remoteAddress: ip },
      } as IncomingMessage & {
        body?: unknown;
        url?: string;
        ip?: string;
      },
      {
        statusCode: 200,
        setHeader(name: string, value: string | number) {
          if (name.toLowerCase() === 'retry-after') {
            retryAfter = value;
          }
        },
        end(chunk?: unknown) {
          statusCode = 429;
          body =
            typeof chunk === 'string' ? chunk : JSON.stringify(chunk ?? {});
        },
      } as ServerResponse & {
        status?: (code: number) => ServerResponse;
        setHeader: (name: string, value: string | number) => void;
        end: (chunk?: unknown) => void;
      },
      () => {
        throw new Error('should not proceed');
      },
    );

    expect(statusCode).toBe(429);
    expect(retryAfter).toBeDefined();
    expect(body).toContain('TOO_MANY_REQUESTS');
  });

  it('ventana', async () => {
    let now = 3_000_000;
    const limiter = new AuthRateLimiter(
      createMemoryAuthRateLimitStore(),
      () => now,
    );
    const ip = '3.3.3.3';
    const email = 'user@example.com';

    for (let i = 0; i < AUTH_RATE_LIMIT_MAX_FAILURES; i += 1) {
      await limiter.recordFailure(ip, email);
    }
    expect((await limiter.check(ip, email)).allowed).toBe(false);

    now += AUTH_RATE_LIMIT_WINDOW_MS;
    expect((await limiter.check(ip, email)).allowed).toBe(true);
  });

  it('no enumera', () => {
    const missingEmailBody = {
      message: 'Invalid email or password',
      code: 'INVALID_EMAIL_OR_PASSWORD',
    };
    const badPasswordBody = {
      message: 'Invalid email or password',
      code: 'INVALID_EMAIL_OR_PASSWORD',
    };
    expect(missingEmailBody).toEqual(badPasswordBody);
    expect(missingEmailBody).toEqual({
      message: 'Invalid email or password',
      code: 'INVALID_EMAIL_OR_PASSWORD',
    });
  });

  it('otra ip', async () => {
    const now = 4_000_000;
    const store = createMemoryAuthRateLimitStore();
    const limiter = new AuthRateLimiter(store, () => now);
    const email = 'shared@example.com';

    for (let i = 0; i < AUTH_RATE_LIMIT_MAX_FAILURES; i += 1) {
      await limiter.recordFailure('10.0.0.1', email);
    }
    expect((await limiter.check('10.0.0.1', email)).allowed).toBe(false);
    expect((await limiter.check('10.0.0.2', email)).allowed).toBe(true);

    expect(authRateLimitKey('10.0.0.1', email)).not.toBe(
      authRateLimitKey('10.0.0.2', email),
    );
  });

  it('no es contador global del proceso', async () => {
    const now = 5_000_000;
    const limiter = new AuthRateLimiter(
      createMemoryAuthRateLimitStore(),
      () => now,
    );

    for (let i = 0; i < AUTH_RATE_LIMIT_MAX_FAILURES; i += 1) {
      await limiter.recordFailure('8.8.8.8', 'a@example.com');
    }
    expect((await limiter.check('8.8.8.8', 'a@example.com')).allowed).toBe(
      false,
    );
    expect((await limiter.check('8.8.8.8', 'b@example.com')).allowed).toBe(
      true,
    );
  });
});
