import { Logger } from '@nestjs/common';

export const WRITE_RATE_LIMIT_MAX = 30;
export const WRITE_RATE_LIMIT_WINDOW_MS = 60_000;

export type WriteRateLimitClock = () => number;

export type WriteRateLimitStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
};

export type WriteRateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export function writeRateLimitKey(userId: string): string {
  return `write-rl:${userId}`;
}

export class WriteRateLimiter {
  private readonly logger = new Logger(WriteRateLimiter.name);

  constructor(
    private readonly store: WriteRateLimitStore,
    private readonly clock: WriteRateLimitClock = () => Date.now(),
    private readonly max = WRITE_RATE_LIMIT_MAX,
    private readonly windowMs = WRITE_RATE_LIMIT_WINDOW_MS,
  ) {}

  async consume(userId: string): Promise<WriteRateLimitDecision> {
    try {
      return await this.consumeUnsafe(userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Write rate limit store failed (fail-open): ${message}`);
      return { allowed: true, remaining: this.max };
    }
  }

  private async consumeUnsafe(userId: string): Promise<WriteRateLimitDecision> {
    const key = writeRateLimitKey(userId);
    const now = this.clock();
    const stamps = await this.readStamps(key);
    const fresh = stamps.filter((ts) => now - ts < this.windowMs);

    if (fresh.length >= this.max) {
      const oldest = fresh[0] ?? now;
      const retryAfterMs = oldest + this.windowMs - now;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    fresh.push(now);
    await this.store.set(key, JSON.stringify(fresh));
    return {
      allowed: true,
      remaining: this.max - fresh.length,
    };
  }

  private async readStamps(key: string): Promise<number[]> {
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
    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
  }
}

export function createMemoryWriteRateLimitStore(): WriteRateLimitStore {
  const map = new Map<string, string>();
  return {
    get(key) {
      return Promise.resolve(map.get(key) ?? null);
    },
    set(key, value) {
      map.set(key, value);
      return Promise.resolve();
    },
  };
}

export function createRedisWriteRateLimitStore(redis: {
  get: (key: string) => Promise<string | null>;
  set: (
    key: string,
    value: string,
    expiryMode: 'EX',
    seconds: number,
  ) => Promise<unknown>;
}): WriteRateLimitStore {
  const ttlSeconds = Math.ceil(WRITE_RATE_LIMIT_WINDOW_MS / 1000);
  return {
    async get(key) {
      return redis.get(key);
    },
    async set(key, value) {
      await redis.set(key, value, 'EX', ttlSeconds);
    },
  };
}

export const WRITE_HTTP_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isWriteMethod(method: string | undefined): boolean {
  return WRITE_HTTP_METHODS.has((method ?? '').toUpperCase());
}

export function isHealthPath(path: string): boolean {
  return (
    path === '/api/v1/health' ||
    path.startsWith('/api/v1/health/') ||
    path === '/health' ||
    path.startsWith('/health/')
  );
}
