import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Institution, Prisma } from '../generated/prisma/client.js';
import { withStableIdOrder } from '../common/query/pagination.js';
import { buildSearchWhere, mergeWhere } from '../common/query/search.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { INSTITUTION_SEARCH_FIELDS } from './institution.dto.js';

export type CreateInstitutionInput = {
  name: string;
  countryCode: string;
  website?: string | null;
};

export type UpdateInstitutionInput = {
  name?: string;
  countryCode?: string;
  website?: string | null;
};

export type ListInstitutionsArgs = {
  skip: number;
  take: number;
  orderBy: Prisma.InstitutionOrderByWithRelationInput[];
  where: Prisma.InstitutionWhereInput;
  q?: string;
};

@Injectable()
export class InstitutionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    args: ListInstitutionsArgs = {
      skip: 0,
      take: 20,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
      where: {},
    },
  ): Promise<{ items: Institution[]; total: number }> {
    const search = buildSearchWhere(
      args.q,
      INSTITUTION_SEARCH_FIELDS,
    ) as Prisma.InstitutionWhereInput;
    const where = mergeWhere(
      args.where,
      search,
    ) as Prisma.InstitutionWhereInput;

    const [items, total] = await Promise.all([
      this.prisma.client.institution.findMany({
        where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.client.institution.count({ where }),
    ]);
    return { items, total };
  }

  async listDeleted(
    args: Omit<ListInstitutionsArgs, 'q'> = {
      skip: 0,
      take: 20,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
      where: {},
    },
  ): Promise<{ items: Institution[]; total: number }> {
    const where = args.where;
    const [items, total] = await Promise.all([
      this.prisma.client.institution.findMany({
        where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
        ...({ onlyDeleted: true } as object),
      }),
      this.prisma.client.institution.count({
        where,
        ...({ onlyDeleted: true } as object),
      }),
    ]);
    return { items, total };
  }

  async get(id: string): Promise<Institution> {
    const row = await this.prisma.client.institution.findFirst({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Institution not found');
    }
    return row;
  }

  /** Loads a row including soft-deleted (for audit before / restore checks). */
  async getWithDeleted(id: string): Promise<Institution> {
    const row = await this.prisma.client.institution.findFirst({
      where: { id },
      ...({ withDeleted: true } as object),
    });
    if (!row) {
      throw new NotFoundException('Institution not found');
    }
    return row;
  }

  async create(input: CreateInstitutionInput): Promise<Institution> {
    return this.prisma.client.institution.create({
      data: {
        name: input.name,
        countryCode: input.countryCode,
        website: input.website ?? null,
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
    input: UpdateInstitutionInput,
  ): Promise<Institution> {
    const data: Prisma.InstitutionUpdateManyMutationInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.countryCode !== undefined
        ? { countryCode: input.countryCode }
        : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      version: { increment: 1 },
    };

    const result = await this.prisma.client.institution.updateMany({
      where: { id, version },
      data,
    });

    if (result.count === 0) {
      const existing = await this.prisma.client.institution.findFirst({
        where: { id },
        ...({ withDeleted: true } as object),
      });
      if (!existing || existing.deletedAt !== null) {
        throw new NotFoundException('Institution not found');
      }
      throw new ConflictException('Version conflict');
    }

    return this.get(id);
  }

  async remove(id: string): Promise<Institution> {
    const row = await this.get(id);
    const activeIncubators = await this.prisma.client.incubator.count({
      where: { institutionId: id },
    });
    if (activeIncubators > 0) {
      throw new ConflictException(
        'Institution has active incubators and cannot be deleted',
      );
    }
    return this.prisma.client.institution.delete({
      where: { id: row.id },
    });
  }

  async restore(id: string): Promise<Institution> {
    const row = await this.getWithDeleted(id);
    if (row.deletedAt === null) {
      throw new ConflictException('Institution is already active');
    }

    const clash = await this.prisma.client.institution.findFirst({
      where: {
        name: row.name,
        countryCode: row.countryCode,
        NOT: { id: row.id },
      },
    });
    if (clash) {
      throw new ConflictException(
        'An active institution with the same name and country already exists',
      );
    }

    return (await (
      this.prisma.client
        .institution as typeof this.prisma.client.institution & {
        restore: (entityId: string) => Promise<Institution>;
      }
    ).restore(id)) as Institution;
  }

  /**
   * Physical delete only when already soft-deleted.
   * Active purge → 409.
   */
  async purge(id: string): Promise<void> {
    const row = await this.getWithDeleted(id);
    if (row.deletedAt === null) {
      throw new ConflictException(
        'Institution must be soft-deleted before purge',
      );
    }
    await this.prisma.base.institution.delete({
      where: { id },
    });
  }
}
