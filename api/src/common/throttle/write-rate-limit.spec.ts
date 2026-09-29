import {
  WRITE_RATE_LIMIT_MAX,
  WriteRateLimiter,
  createMemoryWriteRateLimitStore,
  isHealthPath,
  isWriteMethod,
  type WriteRateLimitStore,
} from './write-rate-limit.js';

describe('WriteRateLimiter', () => {
  function limiterWithClock(
    store: WriteRateLimitStore,
    nowRef: { now: number },
  ): WriteRateLimiter {
    return new WriteRateLimiter(store, () => nowRef.now);
  }

  it('bajo el limite', async () => {
    const store = createMemoryWriteRateLimitStore();
    const nowRef = { now: 1_000_000 };
    const limiter = limiterWithClock(store, nowRef);

    for (let i = 0; i < 10; i += 1) {
      const decision = await limiter.consume('user-a');
      expect(decision.allowed).toBe(true);
      nowRef.now += 10;
    }
  });

  it('excede', async () => {
    const store = createMemoryWriteRateLimitStore();
    const nowRef = { now: 2_000_000 };
    const limiter = limiterWithClock(store, nowRef);

    for (let i = 0; i < WRITE_RATE_LIMIT_MAX; i += 1) {
      const decision = await limiter.consume('user-a');
      expect(decision.allowed).toBe(true);
      nowRef.now += 10;
    }

    const blocked = await limiter.consume('user-a');
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }
  });

  it('por usuario', async () => {
    const store = createMemoryWriteRateLimitStore();
    const nowRef = { now: 3_000_000 };
    const limiter = limiterWithClock(store, nowRef);

    for (let i = 0; i < WRITE_RATE_LIMIT_MAX; i += 1) {
      await limiter.consume('user-a');
      nowRef.now += 10;
    }
    const aBlocked = await limiter.consume('user-a');
    expect(aBlocked.allowed).toBe(false);

    const bOk = await limiter.consume('user-b');
    expect(bOk.allowed).toBe(true);
  });

  it('redis caido', async () => {
    const failingStore: WriteRateLimitStore = {
      get() {
        return Promise.reject(new Error('redis down'));
      },
      set() {
        return Promise.reject(new Error('redis down'));
      },
    };
    const limiter = new WriteRateLimiter(failingStore);
    const decision = await limiter.consume('user-a');
    expect(decision.allowed).toBe(true);
  });

  it('health no es write', () => {
    expect(isHealthPath('/api/v1/health')).toBe(true);
    expect(isWriteMethod('GET')).toBe(false);
    expect(isWriteMethod('POST')).toBe(true);
  });
});
