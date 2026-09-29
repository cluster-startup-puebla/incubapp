import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { requiredEnv } from '../env.js';
import { softDeleteExtension } from './soft-delete.extension.js';

function createBaseClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: requiredEnv('DATABASE_URL'),
  });

  const isDev = process.env.NODE_ENV === 'development';

  return new PrismaClient({
    adapter,
    ...(isDev
      ? {
          log: [{ emit: 'event' as const, level: 'query' as const }],
        }
      : {}),
  });
}

const baseClient = createBaseClient();

export const prisma = baseClient.$extends(softDeleteExtension);

export type ExtendedPrismaClient = typeof prisma;

export function subscribeSlowQueryLog(
  client: PrismaClient,
  logger: Logger = new Logger('Prisma'),
  thresholdMs = 500,
): void {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  // PrismaClient with emit:event supports $on('query').
  (
    client as PrismaClient & {
      $on: (
        event: 'query',
        listener: (e: { query: string; duration: number }) => void,
      ) => void;
    }
  ).$on('query', (event) => {
    if (event.duration >= thresholdMs) {
      logger.warn(
        `Slow query (${event.duration}ms): ${event.query.slice(0, 200)}`,
      );
    }
  });
}

export { baseClient };
