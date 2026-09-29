import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Prisma,
  Startup,
  StartupVisibility,
} from '../generated/prisma/client.js';
import { withStableIdOrder } from '../common/query/pagination.js';
import { buildSearchWhere, mergeWhere } from '../common/query/search.js';
import {
  currentActorId,
  currentIncubatorId,
  currentIsSuperAdmin,
} from '../context/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { STARTUP_SEARCH_FIELDS } from './startup.dto.js';

export type CreateStartupInput = {
  name: string;
  domain: string;
  visibility?: StartupVisibility;
};

export type UpdateStartupInput = {
  name?: string;
  domain?: string;
  visibility?: StartupVisibility;
};

export type ListStartupsArgs = {
  skip: number;
  take: number;
  orderBy: Prisma.StartupOrderByWithRelationInput[];
  where: Prisma.StartupWhereInput;
  q?: string;
};

export type StartupActorContext = {
  roles: string[];
  isSuperAdmin?: boolean;
};

const ELEVATED_ROLES = new Set([
  'director',
  'staff',
  'coorganizer',
  'cluster_admin',
  'mentor',
]);

@Injectable()
export class StartupsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Private startups of another incubator are excluded in the query
   * (not post-filtered). Own tenant still sees private rows.
   */
  private visibilityWhere(): Prisma.StartupWhereInput {
    if (currentIsSuperAdmin()) {
      return {};
    }
    const incubatorId = currentIncubatorId();
    if (incubatorId === null) {
      return { visibility: { not: 'PRIVATE' } };
    }
    return {
      OR: [{ incubatorId }, { visibility: { not: 'PRIVATE' } }],
    };
  }

  private withVisibility(
    where: Prisma.StartupWhereInput,
  ): Prisma.StartupWhereInput {
    return mergeWhere(where, this.visibilityWhere());
  }

  /**
   * Founder-only actors may mutate their own startup; others → 404 (not 403).
   * Directors/staff/mentors/etc. skip this check. Tenant IDOR stays 404 via
   * the Prisma tenant extension.
   */
  private assertFounderOwnerAccess(
    row: Startup,
    actor: StartupActorContext,
  ): void {
    if (actor.isSuperAdmin || currentIsSuperAdmin()) {
      return;
    }
    const founderOnly =
      actor.roles.includes('founder') &&
      !actor.roles.some((role) => ELEVATED_ROLES.has(role));
    if (!founderOnly) {
      return;
    }
    const actorId = currentActorId();
    if (
      row.ownerUserId == null ||
      actorId == null ||
      row.ownerUserId !== actorId
    ) {
      throw new NotFoundException('Startup not found');
    }
  }

  async list(
    args: ListStartupsArgs = {
      skip: 0,
      take: 20,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
      where: {},
    },
  ): Promise<{ items: Startup[]; total: number }> {
    const search = buildSearchWhere(
      args.q,
      STARTUP_SEARCH_FIELDS,
    ) as Prisma.StartupWhereInput;
    const where = this.withVisibility(mergeWhere(args.where, search));

    const [items, total] = await Promise.all([
      this.prisma.client.startup.findMany({
        where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.client.startup.count({ where }),
    ]);
    return { items, total };
  }

  async listDeleted(
    args: Omit<ListStartupsArgs, 'q'> = {
      skip: 0,
      take: 20,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
      where: {},
    },
  ): Promise<{ items: Startup[]; total: number }> {
    const where = this.withVisibility(args.where);
    const [items, total] = await Promise.all([
      this.prisma.client.startup.findMany({
        where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        ...({ onlyDeleted: true } as object),
      }),
      this.prisma.client.startup.count({
        where,
        ...({ onlyDeleted: true } as object),
      }),
    ]);
    return { items, total };
  }

  async get(id: string): Promise<Startup> {
    const row = await this.prisma.client.startup.findFirst({
      where: this.withVisibility({ id }),
    });
    if (!row) {
      throw new NotFoundException('Startup not found');
    }
    return row;
  }

  /** Loads a row including soft-deleted (for audit before / restore checks). */
  async getWithDeleted(id: string): Promise<Startup> {
    const row = await this.prisma.client.startup.findFirst({
      where: this.withVisibility({ id }),
      ...({ withDeleted: true } as object),
    });
    if (!row) {
      throw new NotFoundException('Startup not found');
    }
    return row;
  }

  /**
   * Domain similarity is advisory: colliding domain → 409 with candidates
   * unless super admin passes force=true. Non-super-admin force → 403.
   */
  async create(
    input: CreateStartupInput,
    options: { force?: boolean; isSuperAdmin?: boolean } = {},
  ): Promise<Startup> {
    const force = options.force === true;
    const isSuperAdmin = Boolean(options.isSuperAdmin) || currentIsSuperAdmin();

    if (force && !isSuperAdmin) {
      throw new ForbiddenException(
        'Only super admin may force-create despite domain similarity',
      );
    }

    if (!force) {
      const candidates = await this.prisma.client.startup.findMany({
        where: this.withVisibility({ domain: input.domain }),
        take: 20,
        orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
      });
      if (candidates.length > 0) {
        throw new ConflictException({
          message: 'Similar startups exist for this domain',
          candidates: candidates.map((row) => ({
            id: row.id,
            name: row.name,
            domain: row.domain,
            incubatorId: row.incubatorId,
          })),
        });
      }
    }

    const ownerUserId = currentActorId();
    const incubatorId = currentIncubatorId();
    if (!incubatorId) {
      throw new BadRequestException('X-Incubator-Id is required');
    }

    return this.prisma.client.$transaction(async (tx) => {
      const created = await tx.startup.create({
        data: {
          name: input.name,
          domain: input.domain,
          ...(input.visibility !== undefined
            ? { visibility: input.visibility }
            : {}),
          incubatorId,
          ownerUserId,
        },
      });

      await tx.startupSnapshot.create({
        data: {
          startupId: created.id,
          name: created.name,
          domain: created.domain,
          validFrom: new Date(),
          validTo: null,
        },
      });

      return created;
    });
  }

  /**
   * Optimistic concurrency: where is `{ id, version }`.
   * Missing row with matching version → 409 if still exists, else 404.
   */
  async update(
    id: string,
    version: number,
    input: UpdateStartupInput,
    actor: StartupActorContext = { roles: [] },
  ): Promise<Startup> {
    const existing = await this.get(id);
    this.assertFounderOwnerAccess(existing, actor);

    const data: Prisma.StartupUpdateManyMutationInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.domain !== undefined ? { domain: input.domain } : {}),
      ...(input.visibility !== undefined
        ? { visibility: input.visibility }
        : {}),
      version: { increment: 1 },
    };

    const result = await this.prisma.client.startup.updateMany({
      where: { id, version },
      data,
    });

    if (result.count === 0) {
      const still = await this.prisma.client.startup.findFirst({
        where: this.withVisibility({ id }),
        ...({ withDeleted: true } as object),
      });
      if (!still || still.deletedAt !== null) {
        throw new NotFoundException('Startup not found');
      }
      throw new ConflictException('Version conflict');
    }

    return this.get(id);
  }

  async remove(
    id: string,
    actor: StartupActorContext = { roles: [] },
  ): Promise<Startup> {
    const row = await this.get(id);
    this.assertFounderOwnerAccess(row, actor);
    return this.prisma.client.startup.delete({
      where: { id: row.id },
    });
  }

  async restore(
    id: string,
    actor: StartupActorContext = { roles: [] },
  ): Promise<Startup> {
    const row = await this.getWithDeleted(id);
    this.assertFounderOwnerAccess(row, actor);
    if (row.deletedAt === null) {
      throw new ConflictException('Startup is already active');
    }

    const clash = await this.prisma.client.startup.findFirst({
      where: {
        name: row.name,
        incubatorId: row.incubatorId,
        NOT: { id: row.id },
      },
    });
    if (clash) {
      throw new ConflictException(
        'An active startup with the same name already exists in this incubator',
      );
    }

    return (await (
      this.prisma.client.startup as typeof this.prisma.client.startup & {
        restore: (entityId: string) => Promise<Startup>;
      }
    ).restore(id)) as Startup;
  }

  /**
   * Physical delete only when already soft-deleted.
   * Active purge → 409.
   */
  async purge(id: string): Promise<void> {
    const row = await this.getWithDeleted(id);
    if (row.deletedAt === null) {
      throw new ConflictException('Startup must be soft-deleted before purge');
    }
    await this.prisma.base.startup.delete({
      where: { id },
    });
  }
}
