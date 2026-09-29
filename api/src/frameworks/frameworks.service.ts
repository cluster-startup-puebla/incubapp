import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  Framework,
  FrameworkStage,
  Prisma,
} from '../generated/prisma/client.js';
import { currentIsSuperAdmin } from '../context/request-context.js';
import { withStableIdOrder } from '../common/query/pagination.js';
import { buildSearchWhere, mergeWhere } from '../common/query/search.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertContiguousSortOrders } from './framework-order.js';
import { FRAMEWORK_SEARCH_FIELDS } from './framework.dto.js';

export type CreateFrameworkInput = {
  name: string;
  majorVersion?: number;
  stages?: Array<{ name: string; sortOrder: number }>;
  metricDefs?: Array<{
    key: string;
    name: string;
    allowNegative?: boolean;
  }>;
};

export type UpdateFrameworkInput = {
  name?: string;
};

export type CreateStageInput = {
  name: string;
  sortOrder: number;
};

export type ListFrameworksArgs = {
  skip: number;
  take: number;
  orderBy: Prisma.FrameworkOrderByWithRelationInput[];
  where: Prisma.FrameworkWhereInput;
  q?: string;
  /** When false, only PUBLISHED rows are visible (directors / read-only roles). */
  includeDrafts?: boolean;
};

export type FrameworkWithChildren = Framework & {
  stages: FrameworkStage[];
};

@Injectable()
export class FrameworksService {
  constructor(private readonly prisma: PrismaService) {}

  /** Publish and clone require super admin or cluster_admin. */
  private assertCanPublishOrClone(roles: readonly string[]): void {
    if (currentIsSuperAdmin()) {
      return;
    }
    if (roles.includes('cluster_admin')) {
      return;
    }
    throw new ForbiddenException(
      'Only cluster_admin or super admin may publish or clone frameworks',
    );
  }

  private publishedOnlyWhere(
    where: Prisma.FrameworkWhereInput,
    includeDrafts: boolean,
  ): Prisma.FrameworkWhereInput {
    if (includeDrafts) {
      return where;
    }
    return mergeWhere(where, { status: 'PUBLISHED' });
  }

  async list(
    args: ListFrameworksArgs = {
      skip: 0,
      take: 20,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
      where: {},
      includeDrafts: false,
    },
  ): Promise<{ items: Framework[]; total: number }> {
    const search = buildSearchWhere(
      args.q,
      FRAMEWORK_SEARCH_FIELDS,
    ) as Prisma.FrameworkWhereInput;
    const where = this.publishedOnlyWhere(
      mergeWhere(args.where, search),
      args.includeDrafts ?? false,
    );

    const [items, total] = await Promise.all([
      this.prisma.client.framework.findMany({
        where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.client.framework.count({ where }),
    ]);
    return { items, total };
  }

  async listDeleted(
    args: Omit<ListFrameworksArgs, 'q' | 'includeDrafts'> = {
      skip: 0,
      take: 20,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
      where: {},
    },
  ): Promise<{ items: Framework[]; total: number }> {
    const where = args.where;
    const [items, total] = await Promise.all([
      this.prisma.client.framework.findMany({
        where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        ...({ onlyDeleted: true } as object),
      }),
      this.prisma.client.framework.count({
        where,
        ...({ onlyDeleted: true } as object),
      }),
    ]);
    return { items, total };
  }

  async get(
    id: string,
    options: { includeDrafts?: boolean } = {},
  ): Promise<FrameworkWithChildren> {
    const where: Prisma.FrameworkWhereInput = { id };
    const scoped = this.publishedOnlyWhere(
      where,
      options.includeDrafts ?? false,
    );
    const row = await this.prisma.client.framework.findFirst({
      where: scoped,
      include: { stages: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!row) {
      throw new NotFoundException('Framework not found');
    }
    return row;
  }

  async getWithDeleted(id: string): Promise<Framework> {
    const row = await this.prisma.client.framework.findFirst({
      where: { id },
      ...({ withDeleted: true } as object),
    });
    if (!row) {
      throw new NotFoundException('Framework not found');
    }
    return row;
  }

  async create(input: CreateFrameworkInput): Promise<FrameworkWithChildren> {
    const stages = input.stages ?? [];
    assertContiguousSortOrders(
      stages.map((s) => s.sortOrder),
      'Stage',
    );

    const created = await this.prisma.client.framework.create({
      data: {
        name: input.name,
        majorVersion: input.majorVersion ?? 1,
        status: 'DRAFT',
        stages: {
          create: stages.map((stage) => ({
            name: stage.name,
            sortOrder: stage.sortOrder,
          })),
        },
        metricDefs: {
          create: (input.metricDefs ?? []).map((def) => ({
            key: def.key,
            name: def.name,
            allowNegative: def.allowNegative ?? false,
          })),
        },
      },
      include: { stages: { orderBy: { sortOrder: 'asc' } } },
    });
    return created;
  }

  /**
   * Optimistic concurrency: where is `{ id, version }`.
   * PUBLISHED frameworks are immutable → 409.
   */
  async update(
    id: string,
    version: number,
    input: UpdateFrameworkInput,
  ): Promise<FrameworkWithChildren> {
    const existing = await this.prisma.client.framework.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Framework not found');
    }
    if (existing.status === 'PUBLISHED') {
      throw new ConflictException(
        'Published frameworks are immutable; clone to a new major version',
      );
    }

    const data: Prisma.FrameworkUpdateManyMutationInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      version: { increment: 1 },
    };

    const result = await this.prisma.client.framework.updateMany({
      where: { id, version },
      data,
    });

    if (result.count === 0) {
      const again = await this.prisma.client.framework.findFirst({
        where: { id },
        ...({ withDeleted: true } as object),
      });
      if (!again || again.deletedAt !== null) {
        throw new NotFoundException('Framework not found');
      }
      throw new ConflictException('Version conflict');
    }

    return this.get(id, { includeDrafts: true });
  }

  async addStage(
    frameworkId: string,
    input: CreateStageInput,
  ): Promise<FrameworkStage> {
    const framework = await this.prisma.client.framework.findFirst({
      where: { id: frameworkId },
      include: { stages: true },
    });
    if (!framework) {
      throw new NotFoundException('Framework not found');
    }
    if (framework.status === 'PUBLISHED') {
      throw new ConflictException(
        'Published frameworks are immutable; clone to a new major version',
      );
    }

    const nextOrders = [
      ...framework.stages.map((s) => s.sortOrder),
      input.sortOrder,
    ];
    assertContiguousSortOrders(nextOrders, 'Stage');

    return this.prisma.client.frameworkStage.create({
      data: {
        frameworkId,
        name: input.name,
        sortOrder: input.sortOrder,
      },
    });
  }

  async publish(
    id: string,
    roles: readonly string[],
  ): Promise<FrameworkWithChildren> {
    this.assertCanPublishOrClone(roles);
    const existing = await this.prisma.client.framework.findFirst({
      where: { id },
      include: { stages: true },
    });
    if (!existing) {
      throw new NotFoundException('Framework not found');
    }
    if (existing.status === 'PUBLISHED') {
      throw new ConflictException('Framework is already published');
    }

    assertContiguousSortOrders(
      existing.stages.map((s) => s.sortOrder),
      'Stage',
    );

    await this.prisma.client.framework.updateMany({
      where: { id },
      data: { status: 'PUBLISHED', version: { increment: 1 } },
    });

    return this.get(id, { includeDrafts: true });
  }

  /**
   * Clone to the next major version as DRAFT. Source (e.g. v1 PUBLISHED)
   * stays intact. Copies stages, milestones, and metric defs.
   */
  async clone(
    id: string,
    roles: readonly string[],
  ): Promise<FrameworkWithChildren> {
    this.assertCanPublishOrClone(roles);

    const source = await this.prisma.client.framework.findFirst({
      where: { id },
      include: {
        stages: {
          orderBy: { sortOrder: 'asc' },
          include: { milestones: { orderBy: { sortOrder: 'asc' } } },
        },
        metricDefs: true,
      },
    });
    if (!source) {
      throw new NotFoundException('Framework not found');
    }

    const nextMajor = source.majorVersion + 1;
    const clash = await this.prisma.client.framework.findFirst({
      where: { name: source.name, majorVersion: nextMajor },
    });
    if (clash) {
      throw new ConflictException(
        `Framework "${source.name}" v${nextMajor} already exists`,
      );
    }

    return this.prisma.client.framework.create({
      data: {
        name: source.name,
        majorVersion: nextMajor,
        status: 'DRAFT',
        stages: {
          create: source.stages.map((stage) => ({
            name: stage.name,
            sortOrder: stage.sortOrder,
            milestones: {
              create: stage.milestones.map((milestone) => ({
                name: milestone.name,
                sortOrder: milestone.sortOrder,
                evidenceRequired: milestone.evidenceRequired,
              })),
            },
          })),
        },
        metricDefs: {
          create: source.metricDefs.map((def) => ({
            key: def.key,
            name: def.name,
            allowNegative: def.allowNegative,
          })),
        },
      },
      include: { stages: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async remove(id: string): Promise<Framework> {
    const row = await this.get(id, { includeDrafts: true });
    return this.prisma.client.framework.delete({
      where: { id: row.id },
    });
  }

  async restore(id: string): Promise<Framework> {
    const row = await this.getWithDeleted(id);
    if (row.deletedAt === null) {
      throw new ConflictException('Framework is already active');
    }

    const clash = await this.prisma.client.framework.findFirst({
      where: {
        name: row.name,
        majorVersion: row.majorVersion,
        NOT: { id: row.id },
      },
    });
    if (clash) {
      throw new ConflictException(
        'An active framework with the same name and major version already exists',
      );
    }

    return (await (
      this.prisma.client.framework as typeof this.prisma.client.framework & {
        restore: (entityId: string) => Promise<Framework>;
      }
    ).restore(id)) as Framework;
  }

  async purge(id: string): Promise<void> {
    const row = await this.getWithDeleted(id);
    if (row.deletedAt === null) {
      throw new ConflictException(
        'Framework must be soft-deleted before purge',
      );
    }

    const stages = await this.prisma.base.frameworkStage.findMany({
      where: { frameworkId: id },
      select: { id: true },
    });
    const stageIds = stages.map((s) => s.id);
    if (stageIds.length > 0) {
      await this.prisma.base.milestone.deleteMany({
        where: { stageId: { in: stageIds } },
      });
    }
    await this.prisma.base.metricDef.deleteMany({
      where: { frameworkId: id },
    });
    await this.prisma.base.frameworkStage.deleteMany({
      where: { frameworkId: id },
    });
    await this.prisma.base.framework.delete({
      where: { id },
    });
  }

  /** Used by incubators: only PUBLISHED frameworks may be assigned. */
  async assertPublishedFramework(
    frameworkId: string | null | undefined,
  ): Promise<void> {
    if (frameworkId == null) {
      return;
    }
    const framework = await this.prisma.client.framework.findFirst({
      where: { id: frameworkId },
    });
    if (!framework) {
      throw new NotFoundException('Framework not found');
    }
    if (framework.status !== 'PUBLISHED') {
      throw new UnprocessableEntityException(
        'Incubator may only use a PUBLISHED framework',
      );
    }
  }
}
