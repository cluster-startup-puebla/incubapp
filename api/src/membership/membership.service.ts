import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type {
  Membership,
  MembershipRole,
  MembershipScopeType,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type CreateMembershipInput = {
  userId: string;
  scopeType: MembershipScopeType;
  scopeId: string;
  role: MembershipRole;
  validFrom?: Date;
  validTo?: Date | null;
};

export function isMembershipActive(
  membership: Pick<Membership, 'validFrom' | 'validTo' | 'deletedAt'>,
  now: Date = new Date(),
): boolean {
  if (membership.deletedAt !== null) {
    return false;
  }
  if (membership.validFrom.getTime() > now.getTime()) {
    return false;
  }
  if (
    membership.validTo !== null &&
    membership.validTo.getTime() < now.getTime()
  ) {
    return false;
  }
  return true;
}

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateMembershipInput): Promise<Membership> {
    try {
      return await this.prisma.client.membership.create({
        data: {
          userId: input.userId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          role: input.role,
          validFrom: input.validFrom ?? new Date(),
          validTo: input.validTo ?? null,
        },
      });
    } catch (error) {
      const code =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : typeof error === 'object' &&
              error !== null &&
              'code' in error &&
              typeof (error as { code: unknown }).code === 'string'
            ? (error as { code: string }).code
            : null;
      if (code === 'P2002') {
        throw new ConflictException('Active membership already exists');
      }
      throw error;
    }
  }

  async listActive(
    userId?: string,
    now: Date = new Date(),
  ): Promise<Membership[]> {
    const rows = await this.prisma.client.membership.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'asc' },
    });
    return rows.filter((row) => isMembershipActive(row, now));
  }

  async softDelete(id: string): Promise<Membership> {
    const existing = await this.prisma.client.membership.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Membership not found');
    }
    return await this.prisma.client.membership.delete({
      where: { id },
    });
  }
}
