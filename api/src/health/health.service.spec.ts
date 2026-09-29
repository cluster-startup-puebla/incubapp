import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

type RedisLike = {
  ping: () => Promise<string>;
  disconnect: () => void;
};

function createService(options: {
  queryRaw: () => Promise<unknown>;
  ping: () => Promise<string>;
}): { service: HealthService; redis: RedisLike } {
  const prisma = {
    client: {
      $queryRaw: options.queryRaw,
    },
  } as unknown as PrismaService;

  const configService = {
    get: (key: string) =>
      key === 'REDIS_URL' ? 'redis://localhost:6379' : undefined,
  } as unknown as ConfigService;

  const service = new HealthService(prisma, configService);
  const redis: RedisLike = {
    ping: options.ping,
    disconnect: () => undefined,
  };
  (service as unknown as { redis: RedisLike }).redis = redis;

  return { service, redis };
}

describe('HealthService', () => {
  it('liveness', () => {
    const { service } = createService({
      queryRaw: () => Promise.resolve([{ '?column?': 1 }]),
      ping: () => Promise.resolve('PONG'),
    });

    expect(service.liveness()).toEqual({ status: 'ok' });
  });

  it('ready con db y redis', async () => {
    let pingCalled = false;
    const { service } = createService({
      queryRaw: () => Promise.resolve([{ '?column?': 1 }]),
      ping: () => {
        pingCalled = true;
        return Promise.resolve('PONG');
      },
    });

    await expect(service.readiness()).resolves.toEqual({
      status: 'ok',
      postgres: 'up',
      redis: 'up',
    });
    expect(pingCalled).toBe(true);
  });

  it('postgres caido', async () => {
    let pingCalled = false;
    const { service } = createService({
      queryRaw: () => Promise.reject(new Error('connection refused')),
      ping: () => {
        pingCalled = true;
        return Promise.resolve('PONG');
      },
    });

    await expect(service.readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(pingCalled).toBe(false);
  });

  it('redis caido', async () => {
    const { service } = createService({
      queryRaw: () => Promise.resolve([{ '?column?': 1 }]),
      ping: () => Promise.reject(new Error('connection refused')),
    });

    await expect(service.readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
