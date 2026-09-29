import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Incubator, Prisma } from '../generated/prisma/client.js';
import {
  currentIncubatorId,
  currentIsSuperAdmin,
} from '../context/request-context.js';
import { withStableIdOrder } from '../common/query/pagination.js';
import { buildSearchWhere, mergeWhere } from '../common/query/search.js';
import { FrameworksService } from '../frameworks/frameworks.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { INCUBATOR_SEARCH_FIELDS } from './incubator.dto.js';

export type CreateIncubatorInput = {
  name: string;
  slug: string;
  latitude?: number | null;
  longitude?: number | null;
  institutionId?: string | null;
  frameworkId?: string | null;
};

export type UpdateIncubatorInput = {
  name?: string;
  slug?: string;
  latitude?: number | null;
  longitude?: number | null;
  institutionId?: string | null;
  frameworkId?: string | null;
};

export type ListIncubatorsArgs = {
  skip: number;
  take: number;
  orderBy: Prisma.IncubatorOrderByWithRelationInput[];
  where: Prisma.IncubatorWhereInput;
  q?: string;
};

export type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'Point';
      coordinates: [number, number];
    };
    properties: {
      id: string;
      name: string;
      slug: string;
    };
  }>;
};

@Injectable()
export class IncubatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly frameworks: FrameworksService,
  ) {}

  /**
   * Tenant root is not in TENANT_MODELS. Directors (and others with ALS
   * incubatorId) may only touch the incubator matching their membership scope.
   * Super admin bypasses. Missing/foreign scope → 404 (not 403).
   */
  private assertScopeAccess(id: string): void {
    if (currentIsSuperAdmin()) {
      return;
    }
    const scopeId = currentIncubatorId();
    if (scopeId !== null && scopeId !== id) {
      throw new NotFoundException('Incubator not found');
    }
  }

  private scopeWhere(
    where: Prisma.IncubatorWhereInput = {},
  ): Prisma.IncubatorWhereInput {
    if (currentIsSuperAdmin()) {
      return where;
    }
    const scopeId = currentIncubatorId();
    if (scopeId === null) {
      return where;
    }
    return mergeWhere(where, { id: scopeId });
  }

  async list(
    args: ListIncubatorsArgs = {
      skip: 0,
      take: 20,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
      where: {},
    },
  ): Promise<{ items: Incubator[]; total: number }> {
    const search = buildSearchWhere(
      args.q,
      INCUBATOR_SEARCH_FIELDS,
    ) as Prisma.IncubatorWhereInput;
    const where = this.scopeWhere(mergeWhere(args.where, search));

    const [items, total] = await Promise.all([
      this.prisma.client.incubator.findMany({
        where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.client.incubator.count({ where }),
    ]);
    return { items, total };
  }

  async listDeleted(
    args: Omit<ListIncubatorsArgs, 'q'> = {
      skip: 0,
      take: 20,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
      where: {},
    },
  ): Promise<{ items: Incubator[]; total: number }> {
    const where = this.scopeWhere(args.where);
    const [items, total] = await Promise.all([
      this.prisma.client.incubator.findMany({
        where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        ...({ onlyDeleted: true } as object),
      }),
      this.prisma.client.incubator.count({
        where,
        ...({ onlyDeleted: true } as object),
      }),
    ]);
    return { items, total };
  }

  async get(id: string): Promise<Incubator> {
    this.assertScopeAccess(id);
    const row = await this.prisma.client.incubator.findFirst({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Incubator not found');
    }
    return row;
  }

  /** Loads a row including soft-deleted (for audit before / restore checks). */
  async getWithDeleted(id: string): Promise<Incubator> {
    this.assertScopeAccess(id);
    const row = await this.prisma.client.incubator.findFirst({
      where: { id },
      ...({ withDeleted: true } as object),
    });
    if (!row) {
      throw new NotFoundException('Incubator not found');
    }
    return row;
  }

  private async assertInstitutionExists(
    institutionId: string | null | undefined,
  ): Promise<void> {
    if (institutionId == null) {
      return;
    }
    const institution = await this.prisma.client.institution.findFirst({
      where: { id: institutionId },
    });
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }
  }

  async create(input: CreateIncubatorInput): Promise<Incubator> {
    await this.assertInstitutionExists(input.institutionId);
    await this.frameworks.assertPublishedFramework(input.frameworkId);
    return this.prisma.client.incubator.create({
      data: {
        name: input.name,
        slug: input.slug,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        institutionId: input.institutionId ?? null,
        frameworkId: input.frameworkId ?? null,
      },
    });
  }

  /**
   * Optimistic concurrency: where is `{ id, version }`.
   * Missing row with matching version → 409 if still exists, else 404.
   */
  async update(
    id: string,
    version: number,
    input: UpdateIncubatorInput,
  ): Promise<Incubator> {
    this.assertScopeAccess(id);
    await this.assertInstitutionExists(input.institutionId);
    await this.frameworks.assertPublishedFramework(input.frameworkId);

    const data: Prisma.IncubatorUpdateManyMutationInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
      ...(input.institutionId !== undefined
        ? { institutionId: input.institutionId }
        : {}),
      ...(input.frameworkId !== undefined
        ? { frameworkId: input.frameworkId }
        : {}),
      version: { increment: 1 },
    };

    const result = await this.prisma.client.incubator.updateMany({
      where: { id, version },
      data,
    });

    if (result.count === 0) {
      const existing = await this.prisma.client.incubator.findFirst({
        where: { id },
        ...({ withDeleted: true } as object),
      });
      if (!existing || existing.deletedAt !== null) {
        throw new NotFoundException('Incubator not found');
      }
      throw new ConflictException('Version conflict');
    }

    return this.get(id);
  }

  async remove(id: string): Promise<Incubator> {
    const row = await this.get(id);
    const activeIncubations = await this.prisma.client.incubation.count({
      where: { incubatorId: id, status: 'active' },
    });
    if (activeIncubations > 0) {
      throw new ConflictException(
        'Incubator has active incubations and cannot be deleted',
      );
    }
    return this.prisma.client.incubator.delete({
      where: { id: row.id },
    });
  }

  async restore(id: string): Promise<Incubator> {
    const row = await this.getWithDeleted(id);
    if (row.deletedAt === null) {
      throw new ConflictException('Incubator is already active');
    }

    const clash = await this.prisma.client.incubator.findFirst({
      where: {
        slug: row.slug,
        NOT: { id: row.id },
      },
    });
    if (clash) {
      throw new ConflictException(
        'An active incubator with the same slug already exists',
      );
    }

    return (await (
      this.prisma.client.incubator as typeof this.prisma.client.incubator & {
        restore: (entityId: string) => Promise<Incubator>;
      }
    ).restore(id)) as Incubator;
  }

  /**
   * Physical delete only when already soft-deleted.
   * Active purge → 409.
   */
  async purge(id: string): Promise<void> {
    const row = await this.getWithDeleted(id);
    if (row.deletedAt === null) {
      throw new ConflictException(
        'Incubator must be soft-deleted before purge',
      );
    }
    await this.prisma.base.incubation.deleteMany({
      where: { incubatorId: id },
    });
    await this.prisma.base.incubator.delete({
      where: { id },
    });
  }

  /** GeoJSON FeatureCollection of active incubators with both coordinates. */
  async mapFeatures(): Promise<GeoJsonFeatureCollection> {
    const where = this.scopeWhere({
      latitude: { not: null },
      longitude: { not: null },
    });
    const rows = await this.prisma.client.incubator.findMany({
      where,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
    });

    return {
      type: 'FeatureCollection',
      features: rows
        .filter(
          (row): row is Incubator & { latitude: number; longitude: number } =>
            row.latitude != null && row.longitude != null,
        )
        .map((row) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [row.longitude, row.latitude] as [number, number],
          },
          properties: {
            id: row.id,
            name: row.name,
            slug: row.slug,
          },
        })),
    };
  }
}
