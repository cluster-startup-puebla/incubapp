import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../../config/env.schema.js';
import {
  createMemoryWriteRateLimitStore,
  createRedisWriteRateLimitStore,
  WriteRateLimiter,
} from './write-rate-limit.js';
import { WriteRateLimitGuard } from './write-rate-limit.guard.js';

export const WRITE_RATE_LIMITER = Symbol('WRITE_RATE_LIMITER');

@Global()
@Module({
  providers: [
    {
      provide: WRITE_RATE_LIMITER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): WriteRateLimiter => {
        const redisUrl = config.get('REDIS_URL', { infer: true });
        try {
          const redis = new Redis(redisUrl, {
            maxRetriesPerRequest: 1,
            lazyConnect: true,
          });
          redis.on('error', () => {
            // Failures are handled per-consume (fail-open).
          });
          return new WriteRateLimiter(createRedisWriteRateLimitStore(redis));
        } catch {
          return new WriteRateLimiter(createMemoryWriteRateLimitStore());
        }
      },
    },
    {
      provide: WriteRateLimitGuard,
      inject: [WRITE_RATE_LIMITER],
      useFactory: (limiter: WriteRateLimiter) =>
        new WriteRateLimitGuard(limiter),
    },
  ],
  exports: [WRITE_RATE_LIMITER, WriteRateLimitGuard],
})
export class WriteRateLimitModule {}
