import { createHash } from 'node:crypto';

/** Redis / store TTL for idempotent responses (24h). */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export const IDEMPOTENCY_HEADER = 'idempotency-key';

export const IDEMPOTENCY_STORE = Symbol('IDEMPOTENCY_STORE');

/** Request property set by IdempotencyGuard when a cached response exists. */
export const IDEMPOTENCY_REPLAY = Symbol('idempotency:replay');

export type IdempotencyRecord = {
  bodyHash: string;
  statusCode: number;
  body: unknown;
};

export type IdempotencyStore = {
  get: (key: string) => Promise<IdempotencyRecord | null>;
  set: (
    key: string,
    record: IdempotencyRecord,
    ttlSeconds: number,
  ) => Promise<void>;
};

/**
 * Redis key includes the user id so keys are not shared across users.
 */
export function idempotencyStoreKey(
  userId: string,
  idempotencyKey: string,
): string {
  return `idempotency:${userId}:${idempotencyKey}`;
}

export function hashIdempotencyBody(body: unknown): string {
  const normalized = JSON.stringify(body ?? null);
  return createHash('sha256').update(normalized).digest('hex');
}

export function createMemoryIdempotencyStore(): IdempotencyStore {
  const map = new Map<string, IdempotencyRecord>();
  return {
    get(key) {
      return Promise.resolve(map.get(key) ?? null);
    },
    set(key, record) {
      map.set(key, record);
      return Promise.resolve();
    },
  };
}

export function createRedisIdempotencyStore(redis: {
  get: (key: string) => Promise<string | null>;
  set: (
    key: string,
    value: string,
    expiryMode: 'EX',
    seconds: number,
  ) => Promise<unknown>;
}): IdempotencyStore {
  return {
    async get(key) {
      const raw = await redis.get(key);
      if (!raw) {
        return null;
      }
      try {
        return JSON.parse(raw) as IdempotencyRecord;
      } catch {
        return null;
      }
    },
    async set(key, record, ttlSeconds) {
      await redis.set(key, JSON.stringify(record), 'EX', ttlSeconds);
    },
  };
}
