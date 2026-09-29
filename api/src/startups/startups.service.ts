import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type {
  Prisma,
  Startup,
  StartupSnapshot,
  StartupVisibility,
} from '../generated/prisma/client.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
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

export type UpdateStartupSnapshotInput = {
  name?: string;
  domain?: string;
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

type SnapshotWriter = {
  startupSnapshot: {
    findFirst: (args: {
      where: { startupId: string; validTo: null };
      orderBy: { validFrom: 'desc' };
    }) => Promise<{ id: string } | null>;
    update: (args: {
      where: { id: string };
      data: { validTo: Date };
    }) => Promise<unknown>;
    create: (args: {
      data: {
        startupId: string;
        name: string;
        domain: string;
        validFrom: Date;
        validTo: null;
      };
    }) => Promise<unknown>;
  };
};

@Injectable()
export class StartupsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly analytics?: AnalyticsService,
  ) {}

  private async bumpAnalyticsCache(): Promise<void> {
    await this.analytics?.invalidateOverviewCache();
  }

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

  async getSnapshot(id: string): Promise<StartupSnapshot> {
    const row = await this.prisma.client.startupSnapshot.findFirst({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Startup snapshot not found');
    }
    // Ensure tenant / visibility via parent startup.
    await this.get(row.startupId);
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

    const created = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.startup.create({
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
          startupId: row.id,
          name: row.name,
          domain: row.domain,
          validFrom: new Date(),
          validTo: null,
        },
      });

      return row;
    });
    await this.bumpAnalyticsCache();
    return created;
  }

  /**
   * Closes the current snapshot and opens a new one at the same boundary.
   * Contiguous half-open ranges satisfy the SQL EXCLUDE constraint.
   */
  private async rotateSnapshot(
    tx: SnapshotWriter,
    startupId: string,
    next: { name: string; domain: string },
  ): Promise<void> {
    const current = await tx.startupSnapshot.findFirst({
      where: { startupId, validTo: null },
      orderBy: { validFrom: 'desc' },
    });
    if (!current) {
      throw new ConflictException('No current startup snapshot');
    }

    const boundary = new Date();
    await tx.startupSnapshot.update({
      where: { id: current.id },
      data: { validTo: boundary },
    });
    await tx.startupSnapshot.create({
      data: {
        startupId,
        name: next.name,
        domain: next.domain,
        validFrom: boundary,
        validTo: null,
      },
    });
  }

  /**
   * Optimistic concurrency: where is `{ id, version }`.
   * Missing row with matching version → 409 if still exists, else 404.
   * Watched field changes (name, domain) rotate the snapshot in the same tx.
   */
  async update(
    id: string,
    version: number,
    input: UpdateStartupInput,
    actor: StartupActorContext = { roles: [] },
  ): Promise<Startup> {
    const existing = await this.get(id);
    this.assertFounderOwnerAccess(existing, actor);

    const nextName = input.name !== undefined ? input.name : existing.name;
    const nextDomain =
      input.domain !== undefined ? input.domain : existing.domain;
    const watchedChanged =
      nextName !== existing.name || nextDomain !== existing.domain;

    const data: Prisma.StartupUpdateManyMutationInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.domain !== undefined ? { domain: input.domain } : {}),
      ...(input.visibility !== undefined
        ? { visibility: input.visibility }
        : {}),
      version: { increment: 1 },
    };

    if (!watchedChanged) {
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

      await this.bumpAnalyticsCache();
      return this.get(id);
    }

    await this.prisma.client.$transaction(async (tx) => {
      const result = await tx.startup.updateMany({
        where: { id, version },
        data,
      });

      if (result.count === 0) {
        const still = await tx.startup.findFirst({
          where: this.withVisibility({ id }),
          ...({ withDeleted: true } as object),
        });
        if (!still || still.deletedAt !== null) {
          throw new NotFoundException('Startup not found');
        }
        throw new ConflictException('Version conflict');
      }

      await this.rotateSnapshot(tx, id, {
        name: nextName,
        domain: nextDomain,
      });
    });

    await this.bumpAnalyticsCache();
    return this.get(id);
  }

  /**
   * Corrects the current (open) snapshot only. Closed rows (validTo set) → 409.
   * Keeps the parent startup name/domain in sync when those fields change.
   */
  async updateSnapshot(
    snapshotId: string,
    input: UpdateStartupSnapshotInput,
    actor: StartupActorContext = { roles: [] },
  ): Promise<StartupSnapshot> {
    const snapshot = await this.prisma.client.startupSnapshot.findFirst({
      where: { id: snapshotId },
    });
    if (!snapshot) {
      throw new NotFoundException('Startup snapshot not found');
    }

    const startup = await this.get(snapshot.startupId);
    this.assertFounderOwnerAccess(startup, actor);

    if (snapshot.validTo !== null) {
      throw new ConflictException('Cannot update a closed startup snapshot');
    }

    const nextName = input.name !== undefined ? input.name : snapshot.name;
    const nextDomain =
      input.domain !== undefined ? input.domain : snapshot.domain;

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.startupSnapshot.update({
        where: { id: snapshotId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.domain !== undefined ? { domain: input.domain } : {}),
        },
      });

      if (nextName !== startup.name || nextDomain !== startup.domain) {
        await tx.startup.update({
          where: { id: startup.id },
          data: { name: nextName, domain: nextDomain },
        });
      }

      return updated;
    });
  }

  async remove(
    id: string,
    actor: StartupActorContext = { roles: [] },
  ): Promise<Startup> {
    const row = await this.get(id);
    this.assertFounderOwnerAccess(row, actor);
    const deleted = await this.prisma.client.startup.delete({
      where: { id: row.id },
    });
    await this.bumpAnalyticsCache();
    return deleted;
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

    const restored = (await (
      this.prisma.client.startup as typeof this.prisma.client.startup & {
        restore: (entityId: string) => Promise<Startup>;
      }
    ).restore(id)) as Startup;
    await this.bumpAnalyticsCache();
    return restored;
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
    await this.bumpAnalyticsCache();
  }
}
