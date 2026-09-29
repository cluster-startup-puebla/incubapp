import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Startup } from '../generated/prisma/client.js';
import { withStableIdOrder } from '../common/query/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type CreateStartupInput = {
  name: string;
  ownerUserId?: string | null;
};

export type UpdateStartupInput = {
  name?: string;
  ownerUserId?: string | null;
};

export type ListStartupsArgs = {
  skip: number;
  take: number;
  orderBy: Prisma.StartupOrderByWithRelationInput[];
  where: Prisma.StartupWhereInput;
};

@Injectable()
export class StartupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    args: ListStartupsArgs = {
      skip: 0,
      take: 20,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
      where: {},
    },
  ): Promise<{ items: Startup[]; total: number }> {
    const [items, total] = await Promise.all([
      this.prisma.client.startup.findMany({
        where: args.where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.client.startup.count({ where: args.where }),
    ]);
    return { items, total };
  }

  async get(id: string): Promise<Startup> {
    const row = await this.prisma.client.startup.findFirst({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Startup not found');
    }
    return row;
  }

  async create(input: CreateStartupInput): Promise<Startup> {
    // Tenant extension fills incubatorId from ALS when present.
    return this.prisma.client.startup.create({
      data: {
        name: input.name,
        incubatorId: '00000000-0000-7000-8000-000000000000',
        ownerUserId: input.ownerUserId ?? null,
      },
    });
  }

  async update(id: string, input: UpdateStartupInput): Promise<Startup> {
    await this.get(id);
    return this.prisma.client.startup.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.ownerUserId !== undefined
          ? { ownerUserId: input.ownerUserId }
          : {}),
      },
    });
  }

  async remove(id: string): Promise<Startup> {
    await this.get(id);
    return await this.prisma.client.startup.delete({
      where: { id },
    });
  }
}
