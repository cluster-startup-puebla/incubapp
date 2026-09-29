import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.schema.js';

type RedisConnection = Pick<Redis, 'ping' | 'disconnect'>;
import { PrismaService } from '../prisma/prisma.service.js';

export type LivenessResult = { status: 'ok' };

export type ReadinessResult = {
  status: 'ok';
  postgres: 'up';
  redis: 'up';
};

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly redisUrl: string;
  private redis: RedisConnection | undefined;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService<Env, true>,
  ) {
    this.redisUrl = configService.get('REDIS_URL', { infer: true });
  }

  private getRedis(): RedisConnection {
    if (!this.redis) {
      this.redis = new Redis(this.redisUrl);
    }
    return this.redis;
  }

  liveness(): LivenessResult {
    return { status: 'ok' };
  }

  async readiness(): Promise<ReadinessResult> {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error' });
    }

    try {
      await this.getRedis().ping();
    } catch {
      throw new ServiceUnavailableException({ status: 'error' });
    }

    return { status: 'ok', postgres: 'up', redis: 'up' };
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
  }
}
