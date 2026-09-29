import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Incubation, Prisma } from '../generated/prisma/client.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import {
  currentIncubatorId,
  currentIsSuperAdmin,
} from '../context/request-context.js';
import { withStableIdOrder } from '../common/query/pagination.js';
import { buildSearchWhere, mergeWhere } from '../common/query/search.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  INCUBATION_SEARCH_FIELDS,
  INCUBATION_TRANSITIONS,
  type IncubationStatus,
} from './incubation.dto.js';

export type CreateIncubationInput = {
  status?: IncubationStatus;
  startedOn?: Date | string | null;
  endedOn?: Date | string | null;
  exitReason?: string | null;
};

export type UpdateIncubationInput = {
  status?: IncubationStatus;
  startedOn?: Date | string | null;
  endedOn?: Date | string | null;
  exitReason?: string | null;
};

export type ListIncubationsArgs = {
  skip: number;
  take: number;
  orderBy: Prisma.IncubationOrderByWithRelationInput[];
  where: Prisma.IncubationWhereInput;
  q?: string;
};

function isIncubationStatus(value: string): value is IncubationStatus {
  return value in INCUBATION_TRANSITIONS;
}

@Injectable()
export class IncubationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly analytics?: AnalyticsService,
  ) {}

  private async bumpAnalyticsCache(): Promise<void> {
    await this.analytics?.invalidateOverviewCache();
  }

  /**
   * Not in TENANT_MODELS. Directors (and others with ALS incubatorId) may
   * only touch incubations of their membership scope. Super admin bypasses.
   * Missing/foreign scope → 404 (not 403).
   */
  private assertScopeAccess(incubatorId: string): void {
    if (currentIsSuperAdmin()) {
      return;
    }
    const scopeId = currentIncubatorId();
    if (scopeId !== null && scopeId !== incubatorId) {
      throw new NotFoundException('Incubation not found');
    }
  }

  private scopeWhere(
    where: Prisma.IncubationWhereInput = {},
  ): Prisma.IncubationWhereInput {
    if (currentIsSuperAdmin()) {
      return where;
    }
    const scopeId = currentIncubatorId();
    if (scopeId === null) {
      return where;
    }
    return mergeWhere(where, { incubatorId: scopeId });
  }

  private asDate(
    value: Date | string | null | undefined,
  ): Date | null | undefined {
    if (value == null || value instanceof Date) {
      return value;
    }
    return new Date(`${value}T00:00:00.000Z`);
  }

  private assertDatesOrdered(
    startedOn: Date | string | null | undefined,
    endedOn: Date | string | null | undefined,
  ): void {
    const start = this.asDate(startedOn);
    const end = this.asDate(endedOn);
    if (start == null || end == null) {
      return;
    }
    if (end < start) {
      throw new BadRequestException('endedOn must be on or after startedOn');
    }
  }

  private assertTransition(from: string, to: IncubationStatus): void {
    if (!isIncubationStatus(from)) {
      throw new ConflictException(`Invalid incubation status transition`);
    }
    if (from === to) {
      return;
    }
    const allowed = INCUBATION_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      throw new ConflictException(
        `Cannot transition incubation from ${from} to ${to}`,
      );
    }
  }

  private assertDroppedHasExitReason(
    status: IncubationStatus,
    exitReason: string | null | undefined,
  ): void {
    if (status !== 'dropped') {
      return;
    }
    if (exitReason == null || exitReason.trim() === '') {
      throw new UnprocessableEntityException(
        'exitReason is required when status is dropped',
      );
    }
  }

  async list(
    args: ListIncubationsArgs = {
      skip: 0,
      take: 20,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
      where: {},
    },
  ): Promise<{ items: Incubation[]; total: number }> {
    const search = buildSearchWhere(
      args.q,
      INCUBATION_SEARCH_FIELDS,
    ) as Prisma.IncubationWhereInput;
    const where = this.scopeWhere(mergeWhere(args.where, search));

    const [items, total] = await Promise.all([
      this.prisma.client.incubation.findMany({
        where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.client.incubation.count({ where }),
    ]);
    return { items, total };
  }

  async listDeleted(
    args: Omit<ListIncubationsArgs, 'q'> = {
      skip: 0,
      take: 20,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
      where: {},
    },
  ): Promise<{ items: Incubation[]; total: number }> {
    const where = this.scopeWhere(args.where);
    const [items, total] = await Promise.all([
      this.prisma.client.incubation.findMany({
        where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        ...({ onlyDeleted: true } as object),
      }),
      this.prisma.client.incubation.count({
        where,
        ...({ onlyDeleted: true } as object),
      }),
    ]);
    return { items, total };
  }

  async get(id: string): Promise<Incubation> {
    const row = await this.prisma.client.incubation.findFirst({
      where: this.scopeWhere({ id }),
    });
    if (!row) {
      throw new NotFoundException('Incubation not found');
    }
    this.assertScopeAccess(row.incubatorId);
    return row;
  }

  async getWithDeleted(id: string): Promise<Incubation> {
    const row = await this.prisma.client.incubation.findFirst({
      where: this.scopeWhere({ id }),
      ...({ withDeleted: true } as object),
    });
    if (!row) {
      throw new NotFoundException('Incubation not found');
    }
    this.assertScopeAccess(row.incubatorId);
    return row;
  }

  async create(input: CreateIncubationInput): Promise<Incubation> {
    const incubatorId = currentIncubatorId();
    if (!incubatorId) {
      throw new BadRequestException('X-Incubator-Id is required');
    }
    this.assertScopeAccess(incubatorId);

    const status: IncubationStatus = input.status ?? 'applied';
    this.assertDatesOrdered(input.startedOn, input.endedOn);
    this.assertDroppedHasExitReason(status, input.exitReason);

    if (status === 'active') {
      const existing = await this.prisma.client.incubation.findFirst({
        where: { incubatorId, status: 'active' },
      });
      if (existing) {
        throw new ConflictException(
          'Incubator already has an active incubation',
        );
      }
    }

    try {
      const created = await this.prisma.client.incubation.create({
        data: {
          incubatorId,
          status,
          startedOn: this.asDate(input.startedOn) ?? null,
          endedOn: this.asDate(input.endedOn) ?? null,
          exitReason: input.exitReason ?? null,
        },
      });
      await this.bumpAnalyticsCache();
      return created;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'Incubator already has an active incubation',
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    version: number,
    input: UpdateIncubationInput,
  ): Promise<Incubation> {
    const current = await this.get(id);

    const nextStatus: IncubationStatus =
      input.status !== undefined
        ? input.status
        : isIncubationStatus(current.status)
          ? current.status
          : 'applied';

    if (input.status !== undefined) {
      this.assertTransition(current.status, input.status);
    }

    const nextStartedOn =
      input.startedOn !== undefined ? input.startedOn : current.startedOn;
    const nextEndedOn =
      input.endedOn !== undefined ? input.endedOn : current.endedOn;
    const nextExitReason =
      input.exitReason !== undefined ? input.exitReason : current.exitReason;

    this.assertDatesOrdered(nextStartedOn, nextEndedOn);
    this.assertDroppedHasExitReason(nextStatus, nextExitReason);

    if (nextStatus === 'active' && current.status !== 'active') {
      const existing = await this.prisma.client.incubation.findFirst({
        where: {
          incubatorId: current.incubatorId,
          status: 'active',
          NOT: { id: current.id },
        },
      });
      if (existing) {
        throw new ConflictException(
          'Incubator already has an active incubation',
        );
      }
    }

    const data: Prisma.IncubationUpdateManyMutationInput = {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.startedOn !== undefined
        ? { startedOn: this.asDate(input.startedOn) ?? null }
        : {}),
      ...(input.endedOn !== undefined
        ? { endedOn: this.asDate(input.endedOn) ?? null }
        : {}),
      ...(input.exitReason !== undefined
        ? { exitReason: input.exitReason }
        : {}),
      version: { increment: 1 },
    };

    try {
      const result = await this.prisma.client.incubation.updateMany({
        where: this.scopeWhere({ id, version }),
        data,
      });

      if (result.count === 0) {
        const existing = await this.prisma.client.incubation.findFirst({
          where: this.scopeWhere({ id }),
          ...({ withDeleted: true } as object),
        });
        if (!existing || existing.deletedAt !== null) {
          throw new NotFoundException('Incubation not found');
        }
        throw new ConflictException('Version conflict');
      }
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'Incubator already has an active incubation',
        );
      }
      throw error;
    }

    await this.bumpAnalyticsCache();
    return this.get(id);
  }

  async remove(id: string): Promise<Incubation> {
    const row = await this.get(id);
    const deleted = await this.prisma.client.incubation.delete({
      where: { id: row.id },
    });
    await this.bumpAnalyticsCache();
    return deleted;
  }

  async restore(id: string): Promise<Incubation> {
    const row = await this.getWithDeleted(id);
    if (row.deletedAt === null) {
      throw new ConflictException('Incubation is already active');
    }

    if (row.status === 'active') {
      const clash = await this.prisma.client.incubation.findFirst({
        where: {
          incubatorId: row.incubatorId,
          status: 'active',
          NOT: { id: row.id },
        },
      });
      if (clash) {
        throw new ConflictException(
          'Incubator already has an active incubation',
        );
      }
    }

    const restored = (await (
      this.prisma.client.incubation as typeof this.prisma.client.incubation & {
        restore: (entityId: string) => Promise<Incubation>;
      }
    ).restore(id)) as Incubation;
    await this.bumpAnalyticsCache();
    return restored;
  }

  async purge(id: string): Promise<void> {
    const row = await this.getWithDeleted(id);
    if (row.deletedAt === null) {
      throw new ConflictException(
        'Incubation must be soft-deleted before purge',
      );
    }
    await this.prisma.base.incubation.delete({
      where: { id },
    });
    await this.bumpAnalyticsCache();
  }
}
