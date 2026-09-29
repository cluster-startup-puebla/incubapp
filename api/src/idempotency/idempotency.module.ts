import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.schema.js';
import { IdempotencyGuard } from './idempotency.guard.js';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';
import {
  IDEMPOTENCY_STORE,
  createMemoryIdempotencyStore,
  createRedisIdempotencyStore,
  type IdempotencyStore,
} from './idempotency.store.js';

/**
 * Ready for AppModule import. Not wired until the parent registers it.
 */
@Global()
@Module({
  providers: [
    {
      provide: IDEMPOTENCY_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): IdempotencyStore => {
        const redisUrl = config.get('REDIS_URL', { infer: true });
        try {
          const redis = new Redis(redisUrl, {
            maxRetriesPerRequest: 1,
            lazyConnect: true,
          });
          redis.on('error', () => {
            // Connection errors surface on get/set; no fail-open.
          });
          return createRedisIdempotencyStore(redis);
        } catch {
          return createMemoryIdempotencyStore();
        }
      },
    },
    IdempotencyGuard,
    IdempotencyInterceptor,
  ],
  exports: [IDEMPOTENCY_STORE, IdempotencyGuard, IdempotencyInterceptor],
})
export class IdempotencyModule {}
