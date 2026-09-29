import type { Redis } from 'ioredis';

export type SecondaryStorage = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttl?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
  getAndDelete: (key: string) => Promise<string | null>;
  increment: (key: string, ttl: number) => Promise<number>;
};

const KEY_PREFIX = 'better-auth:';

export function createRedisSecondaryStorage(
  redis: Pick<Redis, 'get' | 'set' | 'del' | 'incr' | 'expire' | 'getdel'>,
): SecondaryStorage {
  return {
    async get(key) {
      return redis.get(`${KEY_PREFIX}${key}`);
    },
    async set(key, value, ttl) {
      const namespaced = `${KEY_PREFIX}${key}`;
      if (ttl) {
        await redis.set(namespaced, value, 'EX', ttl);
        return;
      }
      await redis.set(namespaced, value);
    },
    async delete(key) {
      await redis.del(`${KEY_PREFIX}${key}`);
    },
    async getAndDelete(key) {
      const namespaced = `${KEY_PREFIX}${key}`;
      if (typeof redis.getdel === 'function') {
        return redis.getdel(namespaced);
      }
      const value = await redis.get(namespaced);
      if (value !== null) {
        await redis.del(namespaced);
      }
      return value;
    },
    async increment(key, ttl) {
      const namespaced = `${KEY_PREFIX}${key}`;
      const value = await redis.incr(namespaced);
      if (value === 1 && ttl > 0) {
        await redis.expire(namespaced, ttl);
      }
      return value;
    },
  };
}
