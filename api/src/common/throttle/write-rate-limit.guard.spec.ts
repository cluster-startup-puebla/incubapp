import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { WriteRateLimitGuard } from './write-rate-limit.guard.js';
import {
  WRITE_RATE_LIMIT_MAX,
  WriteRateLimiter,
  createMemoryWriteRateLimitStore,
} from './write-rate-limit.js';

describe('WriteRateLimitGuard', () => {
  it('31st write sets Retry-After and 429', async () => {
    const nowRef = { now: 5_000_000 };
    const limiter = new WriteRateLimiter(
      createMemoryWriteRateLimitStore(),
      () => nowRef.now,
    );
    const guard = new WriteRateLimitGuard(limiter);

    const headers: Record<string, string | number> = {};
    const response = {
      setHeader(name: string, value: string | number) {
        headers[name] = value;
      },
    };

    for (let i = 0; i < WRITE_RATE_LIMIT_MAX; i += 1) {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'POST',
            originalUrl: '/api/v1/institutions',
            user: { id: 'writer-1' },
          }),
          getResponse: () => response,
        }),
      } as unknown as ExecutionContext;
      await expect(guard.canActivate(context)).resolves.toBe(true);
      nowRef.now += 10;
    }

    const blockedContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          originalUrl: '/api/v1/institutions',
          user: { id: 'writer-1' },
        }),
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(blockedContext)).rejects.toBeInstanceOf(
      HttpException,
    );
    try {
      await guard.canActivate(blockedContext);
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    expect(headers['Retry-After']).toBeDefined();
  });

  it('health skipped', async () => {
    const limiter = new WriteRateLimiter(createMemoryWriteRateLimitStore());
    const guard = new WriteRateLimitGuard(limiter);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          originalUrl: '/api/v1/health',
          user: { id: 'writer-1' },
        }),
        getResponse: () => ({ setHeader() {} }),
      }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
