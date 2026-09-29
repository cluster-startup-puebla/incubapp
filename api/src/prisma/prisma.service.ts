import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { PrismaClient } from '../generated/prisma/client.js';
import {
  baseClient,
  prisma,
  subscribeSlowQueryLog,
  type ExtendedPrismaClient,
} from './prisma.client.js';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly client: ExtendedPrismaClient = prisma;
  /** Unextended client for physical purge (bypasses soft-delete). */
  readonly base: PrismaClient = baseClient;

  constructor() {
    subscribeSlowQueryLog(baseClient, this.logger);
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.$connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to connect to Postgres: ${message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
