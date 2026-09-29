import { betterAuth } from 'better-auth';
import { Redis } from 'ioredis';
import { requiredEnv } from './env.js';
import { MailerService } from './mail/mailer.service.js';
import { buildAuthOptions } from './auth/auth-options.js';
import { createRedisSecondaryStorage } from './auth/redis-secondary-storage.js';
import {
  AuthRateLimiter,
  createRedisAuthRateLimitStore,
} from './auth/auth-rate-limit.js';

function createSharedRedis(): Redis | undefined {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return undefined;
  }
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  void redis.connect().catch(() => undefined);
  return redis;
}

const sharedRedis = createSharedRedis();
const liveMailer = new MailerService();

export const authRateLimiter = sharedRedis
  ? new AuthRateLimiter(createRedisAuthRateLimitStore(sharedRedis))
  : undefined;

export const auth = betterAuth(
  buildAuthOptions(
    {
      BETTER_AUTH_URL: requiredEnv('BETTER_AUTH_URL'),
      WEB_ORIGIN: process.env.WEB_ORIGIN,
      CORS_ORIGINS: process.env.CORS_ORIGINS,
    },
    {
      sendMailFn: (message) => liveMailer.send(message),
      secondaryStorage: sharedRedis
        ? createRedisSecondaryStorage(sharedRedis)
        : undefined,
      rateLimiter: authRateLimiter,
    },
  ),
);

export {
  buildAuthOptions,
  MIN_PASSWORD_LENGTH,
  SESSION_EXPIRES_IN_SECONDS,
} from './auth/auth-options.js';
