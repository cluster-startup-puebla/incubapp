import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MetricReading, Prisma } from '../generated/prisma/client.js';
import {
  currentIsSuperAdmin,
  currentUserId,
} from '../context/request-context.js';
import { decodeCursor } from '../common/query/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type UpsertMetricReadingInput = {
  metricDefId: string;
  period: string;
  value: number;
};

export type ListMetricReadingsArgs = {
  startupId: string;
  take: number;
  cursor?: string;
  where?: Prisma.MetricReadingWhereInput;
};

export type ActorAuth = {
  roles: readonly string[];
  isSuperAdmin?: boolean;
};

const VERIFY_ROLES = new Set([
  'cluster_admin',
  'coorganizer',
  'director',
  'staff',
]);

function todayUtcYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function periodToDate(period: string): Date {
  return new Date(`${period}T00:00:00.000Z`);
}

@Injectable()
export class MetricReadingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireStartup(startupId: string) {
    const startup = await this.prisma.client.startup.findFirst({
      where: { id: startupId },
      select: {
        id: true,
        incubatorId: true,
        incubator: { select: { frameworkId: true } },
      },
    });
    if (!startup) {
      throw new NotFoundException('Startup not found');
    }
    return startup;
  }

  private assertPeriodNotFuture(period: string): void {
    if (period > todayUtcYmd()) {
      throw new BadRequestException('period cannot be after today');
    }
  }

  private assertValueAllowed(value: number, allowNegative: boolean): void {
    if (!allowNegative && value < 0) {
      throw new BadRequestException(
        'negative values are not allowed for this metric',
      );
    }
  }

  private canVerify(auth: ActorAuth): boolean {
    if (auth.isSuperAdmin || currentIsSuperAdmin()) {
      return true;
    }
    return auth.roles.some((role) => VERIFY_ROLES.has(role));
  }

  async list(
    args: ListMetricReadingsArgs,
  ): Promise<{ items: MetricReading[]; pageSize: number }> {
    await this.requireStartup(args.startupId);

    const where: Prisma.MetricReadingWhereInput = {
      ...(args.where ?? {}),
      startupId: args.startupId,
    };

    if (args.cursor) {
      const payload = decodeCursor(args.cursor);
      const cursorCreatedAt = new Date(payload.createdAt);
      where.AND = [
        ...(Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : []),
        {
          OR: [
            { createdAt: { lt: cursorCreatedAt } },
            {
              AND: [{ createdAt: cursorCreatedAt }, { id: { lt: payload.id } }],
            },
          ],
        },
      ];
    }

    const items = await this.prisma.client.metricReading.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: args.take,
    });

    return { items, pageSize: args.take };
  }

  async get(startupId: string, id: string): Promise<MetricReading> {
    await this.requireStartup(startupId);
    const row = await this.prisma.client.metricReading.findFirst({
      where: { id, startupId },
    });
    if (!row) {
      throw new NotFoundException('Metric reading not found');
    }
    return row;
  }

  /**
   * Upsert by (startupId, metricDefId, period). Updating a verified row
   * clears verifiedAt / verifiedById.
   */
  async upsert(
    startupId: string,
    input: UpsertMetricReadingInput,
  ): Promise<{ row: MetricReading; created: boolean }> {
    this.assertPeriodNotFuture(input.period);

    const startup = await this.requireStartup(startupId);
    const metricDef = await this.prisma.client.metricDef.findFirst({
      where: { id: input.metricDefId },
    });
    if (!metricDef) {
      throw new NotFoundException('Metric definition not found');
    }

    if (
      startup.incubator.frameworkId != null &&
      metricDef.frameworkId !== startup.incubator.frameworkId
    ) {
      throw new BadRequestException(
        'metricDefId does not belong to the startup incubator framework',
      );
    }

    this.assertValueAllowed(input.value, metricDef.allowNegative);

    const period = periodToDate(input.period);
    const existing = await this.prisma.client.metricReading.findFirst({
      where: {
        startupId,
        metricDefId: input.metricDefId,
        period,
      },
    });

    if (existing) {
      await this.prisma.client.metricReading.updateMany({
        where: { id: existing.id },
        data: {
          value: input.value,
          version: { increment: 1 },
          verifiedAt: null,
          verifiedById: null,
        },
      });
      return { row: await this.get(startupId, existing.id), created: false };
    }

    try {
      const created = await this.prisma.client.metricReading.create({
        data: {
          startupId,
          metricDefId: input.metricDefId,
          period,
          value: input.value,
        },
      });
      return { row: created, created: true };
    } catch (error: unknown) {
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof (error as { code?: unknown }).code === 'string'
          ? (error as { code: string }).code
          : null;
      if (code === 'P2002') {
        const raced = await this.prisma.client.metricReading.findFirst({
          where: {
            startupId,
            metricDefId: input.metricDefId,
            period,
          },
        });
        if (raced) {
          await this.prisma.client.metricReading.updateMany({
            where: { id: raced.id },
            data: {
              value: input.value,
              version: { increment: 1 },
              verifiedAt: null,
              verifiedById: null,
            },
          });
          return { row: await this.get(startupId, raced.id), created: false };
        }
      }
      throw error;
    }
  }

  async verify(
    startupId: string,
    id: string,
    auth: ActorAuth,
  ): Promise<MetricReading> {
    if (!this.canVerify(auth)) {
      throw new ForbiddenException(
        'Only staff or director roles may verify metric readings',
      );
    }

    await this.requireStartup(startupId);
    const existing = await this.prisma.client.metricReading.findFirst({
      where: { id, startupId },
    });
    if (!existing) {
      throw new NotFoundException('Metric reading not found');
    }

    const verifiedById = currentUserId();
    await this.prisma.client.metricReading.updateMany({
      where: { id: existing.id },
      data: {
        verifiedAt: new Date(),
        verifiedById,
        version: { increment: 1 },
      },
    });
    return this.get(startupId, existing.id);
  }
}
