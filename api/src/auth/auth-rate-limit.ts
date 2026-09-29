export const AUTH_RATE_LIMIT_MAX_FAILURES = 5;
export const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export type AuthRateLimitClock = () => number;

export type AuthRateLimitStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  del: (key: string) => Promise<void>;
};

export type AuthRateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function authRateLimitKey(ip: string, email: string): string {
  return `auth-rl:${ip}:${normalizeEmail(email)}`;
}

export class AuthRateLimiter {
  constructor(
    private readonly store: AuthRateLimitStore,
    private readonly clock: AuthRateLimitClock = () => Date.now(),
  ) {}

  async check(ip: string, email: string): Promise<AuthRateLimitDecision> {
    const key = authRateLimitKey(ip, email);
    const failures = await this.readFailures(key);
    if (failures.length >= AUTH_RATE_LIMIT_MAX_FAILURES) {
      const oldest = failures[0] ?? this.clock();
      const retryAfterMs = oldest + AUTH_RATE_LIMIT_WINDOW_MS - this.clock();
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }
    return {
      allowed: true,
      remaining: AUTH_RATE_LIMIT_MAX_FAILURES - failures.length,
    };
  }

  async recordFailure(
    ip: string,
    email: string,
  ): Promise<AuthRateLimitDecision> {
    const key = authRateLimitKey(ip, email);
    const now = this.clock();
    const failures = await this.readFailures(key);
    failures.push(now);
    await this.store.set(key, JSON.stringify(failures));
    return this.check(ip, email);
  }

  async reset(ip: string, email: string): Promise<void> {
    await this.store.del(authRateLimitKey(ip, email));
  }

  private async readFailures(key: string): Promise<number[]> {
    const raw = await this.store.get(key);
    if (!raw) {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) {
      return [];
    }
    const now = this.clock();
    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .filter((value) => now - value < AUTH_RATE_LIMIT_WINDOW_MS)
      .sort((a, b) => a - b);
  }
}

export function createMemoryAuthRateLimitStore(): AuthRateLimitStore {
  const map = new Map<string, string>();
  return {
    get(key) {
      return Promise.resolve(map.get(key) ?? null);
    },
    set(key, value) {
      map.set(key, value);
      return Promise.resolve();
    },
    del(key) {
      map.delete(key);
      return Promise.resolve();
    },
  };
}

export function createRedisAuthRateLimitStore(redis: {
  get: (key: string) => Promise<string | null>;
  set: (
    key: string,
    value: string,
    expiryMode: 'EX',
    seconds: number,
  ) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
}): AuthRateLimitStore {
  const ttlSeconds = Math.ceil(AUTH_RATE_LIMIT_WINDOW_MS / 1000);
  return {
    async get(key) {
      return redis.get(key);
    },
    async set(key, value) {
      await redis.set(key, value, 'EX', ttlSeconds);
    },
    async del(key) {
      await redis.del(key);
    },
  };
}
