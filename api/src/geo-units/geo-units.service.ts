import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  GeoUnit,
  GeoUnitLevel,
  Prisma,
} from '../generated/prisma/client.js';
import { withStableIdOrder } from '../common/query/pagination.js';
import { buildSearchWhere, mergeWhere } from '../common/query/search.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { GEO_UNIT_SEARCH_FIELDS } from './geo-unit.dto.js';

export type CreateGeoUnitInput = {
  level: GeoUnitLevel;
  code: string;
  name: string;
  parentId?: string | null;
};

export type UpdateGeoUnitInput = {
  code?: string;
  name?: string;
  parentId?: string | null;
};

export type ListGeoUnitsArgs = {
  skip: number;
  take: number;
  orderBy: Prisma.GeoUnitOrderByWithRelationInput[];
  where: Prisma.GeoUnitWhereInput;
  q?: string;
};

const PARENT_LEVEL: Record<GeoUnitLevel, GeoUnitLevel | null> = {
  COUNTRY: null,
  STATE: 'COUNTRY',
  MUNICIPALITY: 'STATE',
};

@Injectable()
export class GeoUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    args: ListGeoUnitsArgs = {
      skip: 0,
      take: 20,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
      where: {},
    },
  ): Promise<{ items: GeoUnit[]; total: number }> {
    const search = buildSearchWhere(
      args.q,
      GEO_UNIT_SEARCH_FIELDS,
    ) as Prisma.GeoUnitWhereInput;
    const where = mergeWhere(args.where, search) as Prisma.GeoUnitWhereInput;

    const [items, total] = await Promise.all([
      this.prisma.client.geoUnit.findMany({
        where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.client.geoUnit.count({ where }),
    ]);
    return { items, total };
  }

  async listDeleted(
    args: Omit<ListGeoUnitsArgs, 'q'> = {
      skip: 0,
      take: 20,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
      where: {},
    },
  ): Promise<{ items: GeoUnit[]; total: number }> {
    const where = args.where;
    const [items, total] = await Promise.all([
      this.prisma.client.geoUnit.findMany({
        where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        ...({ onlyDeleted: true } as object),
      }),
      this.prisma.client.geoUnit.count({
        where,
        ...({ onlyDeleted: true } as object),
      }),
    ]);
    return { items, total };
  }

  async listChildren(
    parentId: string,
    args: Omit<ListGeoUnitsArgs, 'q' | 'where'> = {
      skip: 0,
      take: 20,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
    },
  ): Promise<{ items: GeoUnit[]; total: number }> {
    await this.get(parentId);
    const where: Prisma.GeoUnitWhereInput = { parentId };
    const [items, total] = await Promise.all([
      this.prisma.client.geoUnit.findMany({
        where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.client.geoUnit.count({ where }),
    ]);
    return { items, total };
  }

  async get(id: string): Promise<GeoUnit> {
    const row = await this.prisma.client.geoUnit.findFirst({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Geo unit not found');
    }
    return row;
  }

  /** Loads a row including soft-deleted (for audit before / restore checks). */
  async getWithDeleted(id: string): Promise<GeoUnit> {
    const row = await this.prisma.client.geoUnit.findFirst({
      where: { id },
      ...({ withDeleted: true } as object),
    });
    if (!row) {
      throw new NotFoundException('Geo unit not found');
    }
    return row;
  }

  async create(input: CreateGeoUnitInput): Promise<GeoUnit> {
    const parentId = input.parentId ?? null;
    await this.assertHierarchy(input.level, parentId);
    return this.prisma.client.geoUnit.create({
      data: {
        level: input.level,
        code: input.code,
        name: input.name,
        parentId,
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
    input: UpdateGeoUnitInput,
  ): Promise<GeoUnit> {
    const current = await this.get(id);
    const nextParentId =
      input.parentId !== undefined ? input.parentId : current.parentId;

    if (input.parentId !== undefined) {
      await this.assertHierarchy(current.level, nextParentId);
      await this.assertNoCycle(id, nextParentId);
    }

    const data: Prisma.GeoUnitUpdateManyMutationInput = {
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      version: { increment: 1 },
    };

    const result = await this.prisma.client.geoUnit.updateMany({
      where: { id, version },
      data,
    });

    if (result.count === 0) {
      const existing = await this.prisma.client.geoUnit.findFirst({
        where: { id },
        ...({ withDeleted: true } as object),
      });
      if (!existing || existing.deletedAt !== null) {
        throw new NotFoundException('Geo unit not found');
      }
      throw new ConflictException('Version conflict');
    }

    return this.get(id);
  }

  async remove(id: string): Promise<GeoUnit> {
    const row = await this.get(id);
    const activeChildren = await this.prisma.client.geoUnit.count({
      where: { parentId: id },
    });
    if (activeChildren > 0) {
      throw new ConflictException(
        'Geo unit has active children and cannot be deleted',
      );
    }
    return this.prisma.client.geoUnit.delete({
      where: { id: row.id },
    });
  }

  async restore(id: string): Promise<GeoUnit> {
    const row = await this.getWithDeleted(id);
    if (row.deletedAt === null) {
      throw new ConflictException('Geo unit is already active');
    }

    const clash = await this.prisma.client.geoUnit.findFirst({
      where: {
        level: row.level,
        code: row.code,
        NOT: { id: row.id },
      },
    });
    if (clash) {
      throw new ConflictException(
        'An active geo unit with the same level and code already exists',
      );
    }

    return (await (
      this.prisma.client.geoUnit as typeof this.prisma.client.geoUnit & {
        restore: (entityId: string) => Promise<GeoUnit>;
      }
    ).restore(id)) as GeoUnit;
  }

  /**
   * Physical delete only when already soft-deleted.
   * Active purge → 409.
   */
  async purge(id: string): Promise<void> {
    const row = await this.getWithDeleted(id);
    if (row.deletedAt === null) {
      throw new ConflictException('Geo unit must be soft-deleted before purge');
    }
    await this.prisma.base.geoUnit.delete({
      where: { id },
    });
  }

  /**
   * COUNTRY has no parent; STATE→COUNTRY; MUNICIPALITY→STATE.
   * Skipping a level (e.g. municipality under country) is 422.
   */
  async assertHierarchy(
    level: GeoUnitLevel,
    parentId: string | null,
  ): Promise<void> {
    const expectedParentLevel = PARENT_LEVEL[level];

    if (expectedParentLevel === null) {
      if (parentId !== null) {
        throw new UnprocessableEntityException(
          'COUNTRY geo units cannot have a parent',
        );
      }
      return;
    }

    if (parentId === null) {
      throw new UnprocessableEntityException(
        `${level} geo units require a ${expectedParentLevel} parent`,
      );
    }

    const parent = await this.prisma.client.geoUnit.findFirst({
      where: { id: parentId },
    });
    if (!parent) {
      throw new NotFoundException('Parent geo unit not found');
    }
    if (parent.level !== expectedParentLevel) {
      throw new UnprocessableEntityException(
        `${level} parent must be a ${expectedParentLevel}`,
      );
    }
  }

  /** Reject parent = self or any descendant (would create a cycle). */
  async assertNoCycle(id: string, parentId: string | null): Promise<void> {
    if (parentId === null) {
      return;
    }
    if (parentId === id) {
      throw new UnprocessableEntityException(
        'Geo unit cannot be its own parent',
      );
    }

    let cursor: string | null = parentId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === id) {
        throw new UnprocessableEntityException(
          'Geo unit parent cannot be a descendant',
        );
      }
      if (visited.has(cursor)) {
        throw new UnprocessableEntityException(
          'Geo unit hierarchy cycle detected',
        );
      }
      visited.add(cursor);
      const node: { parentId: string | null } | null =
        await this.prisma.client.geoUnit.findFirst({
          where: { id: cursor },
          select: { parentId: true },
        });
      cursor = node?.parentId ?? null;
    }
  }
}
