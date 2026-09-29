import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Incubator, Prisma } from '../generated/prisma/client.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import {
  currentIncubatorId,
  currentIsSuperAdmin,
} from '../context/request-context.js';
import { withStableIdOrder } from '../common/query/pagination.js';
import { buildSearchWhere, mergeWhere } from '../common/query/search.js';
import { FrameworksService } from '../frameworks/frameworks.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ObjectStorage } from '../storage/object-storage.js';
import { INCUBATOR_SEARCH_FIELDS } from './incubator.dto.js';

export const LOGO_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export const LOGO_MAX_BYTES = 1024 * 1024;

export type CreateIncubatorInput = {
  name: string;
  slug: string;
  latitude?: number | null;
  longitude?: number | null;
  brandPrimary?: string | null;
  institutionId?: string | null;
  frameworkId?: string | null;
};

export type UpdateIncubatorInput = {
  name?: string;
  slug?: string;
  latitude?: number | null;
  longitude?: number | null;
  brandPrimary?: string | null;
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

export type IncubatorWithLogo = Incubator & { logoUrl: string | null };

export type LogoFileInput = {
  buffer: Buffer;
  mimetype: string;
  size: number;
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
    private readonly storage: ObjectStorage,
    @Optional() private readonly analytics?: AnalyticsService,
  ) {}

  private async bumpAnalyticsCache(): Promise<void> {
    await this.analytics?.invalidateOverviewCache();
  }

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

  private logoObjectKey(id: string): string {
    return `incubators/${id}/logo`;
  }

  private assertLogoFile(file: LogoFileInput | undefined): LogoFileInput {
    if (!file) {
      throw new BadRequestException('Logo file is required');
    }
    if (!LOGO_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Logo must be png, jpeg, or webp');
    }
    if (file.size > LOGO_MAX_BYTES || file.buffer.length > LOGO_MAX_BYTES) {
      throw new BadRequestException('Logo must be at most 1MB');
    }
    return file;
  }

  private async withLogoUrl(row: Incubator): Promise<IncubatorWithLogo> {
    if (row.logoKey == null) {
      return { ...row, logoUrl: null };
    }
    const signed = await this.storage.signedGet(row.logoKey);
    return { ...row, logoUrl: signed.url };
  }

  /**
   * Optimistic concurrency helper shared by update / logo write paths.
   * Missing row with matching version → 409 if still exists, else 404.
   */
  private async assertVersionUpdate(
    id: string,
    version: number,
    count: number,
  ): Promise<void> {
    if (count > 0) {
      return;
    }
    const existing = await this.prisma.client.incubator.findFirst({
      where: { id },
      ...({ withDeleted: true } as object),
    });
    if (!existing || existing.deletedAt !== null) {
      throw new NotFoundException('Incubator not found');
    }
    throw new ConflictException('Version conflict');
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

  async get(id: string): Promise<IncubatorWithLogo> {
    this.assertScopeAccess(id);
    const row = await this.prisma.client.incubator.findFirst({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Incubator not found');
    }
    return this.withLogoUrl(row);
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
    const created = await this.prisma.client.incubator.create({
      data: {
        name: input.name,
        slug: input.slug,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        brandPrimary: input.brandPrimary ?? null,
        institutionId: input.institutionId ?? null,
        frameworkId: input.frameworkId ?? null,
      },
    });
    await this.bumpAnalyticsCache();
    return created;
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
      ...(input.brandPrimary !== undefined
        ? { brandPrimary: input.brandPrimary }
        : {}),
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

    await this.assertVersionUpdate(id, version, result.count);
    await this.bumpAnalyticsCache();
    const updated = await this.prisma.client.incubator.findFirst({
      where: { id },
    });
    if (!updated) {
      throw new NotFoundException('Incubator not found');
    }
    return updated;
  }

  async uploadLogo(
    id: string,
    version: number,
    file: LogoFileInput | undefined,
  ): Promise<IncubatorWithLogo> {
    this.assertScopeAccess(id);
    const logo = this.assertLogoFile(file);

    const current = await this.prisma.client.incubator.findFirst({
      where: { id },
    });
    if (!current) {
      throw new NotFoundException('Incubator not found');
    }
    if (current.version !== version) {
      throw new ConflictException('Version conflict');
    }

    const key = this.logoObjectKey(id);
    const previousKey = current.logoKey;

    if (previousKey != null) {
      await this.storage.delete(previousKey);
    }

    await this.storage.put(logo.buffer, key);

    const result = await this.prisma.client.incubator.updateMany({
      where: { id, version },
      data: {
        logoKey: key,
        version: { increment: 1 },
      },
    });

    await this.assertVersionUpdate(id, version, result.count);
    await this.bumpAnalyticsCache();
    return this.get(id);
  }

  async deleteLogo(id: string, version: number): Promise<IncubatorWithLogo> {
    this.assertScopeAccess(id);

    const current = await this.prisma.client.incubator.findFirst({
      where: { id },
    });
    if (!current) {
      throw new NotFoundException('Incubator not found');
    }
    if (current.version !== version) {
      throw new ConflictException('Version conflict');
    }

    const previousKey = current.logoKey;

    const result = await this.prisma.client.incubator.updateMany({
      where: { id, version },
      data: {
        logoKey: null,
        version: { increment: 1 },
      },
    });

    await this.assertVersionUpdate(id, version, result.count);

    if (previousKey != null) {
      await this.storage.delete(previousKey);
    }

    await this.bumpAnalyticsCache();
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
    const deleted = await this.prisma.client.incubator.delete({
      where: { id: row.id },
    });
    await this.bumpAnalyticsCache();
    return deleted;
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

    const restored = (await (
      this.prisma.client.incubator as typeof this.prisma.client.incubator & {
        restore: (entityId: string) => Promise<Incubator>;
      }
    ).restore(id)) as Incubator;
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
    await this.bumpAnalyticsCache();
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
