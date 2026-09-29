import { Injectable, NotFoundException } from '@nestjs/common';
import type { Startup } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type CreateStartupInput = {
  name: string;
  /** Ignored when tenant context is set — extension forces ALS incubatorId. */
  incubatorId?: string;
  ownerUserId?: string | null;
};

export type UpdateStartupInput = {
  name?: string;
  incubatorId?: string;
  ownerUserId?: string | null;
};

@Injectable()
export class StartupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<Startup[]> {
    return this.prisma.client.startup.findMany({
      orderBy: { createdAt: 'asc' },
    });
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
    if (!input.incubatorId) {
      // When ALS has a tenant, the extension fills incubatorId; Prisma still
      // needs a value in the type — use a placeholder overwritten by forceTenantData.
      // Callers in global context must pass incubatorId explicitly.
    }
    return this.prisma.client.startup.create({
      data: {
        name: input.name,
        incubatorId:
          input.incubatorId ?? '00000000-0000-7000-8000-000000000000',
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
        ...(input.incubatorId !== undefined
          ? { incubatorId: input.incubatorId }
          : {}),
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
