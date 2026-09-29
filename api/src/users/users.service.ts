import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, User } from '../generated/prisma/client.js';
import { withStableIdOrder } from '../common/query/pagination.js';
import { buildSearchWhere, mergeWhere } from '../common/query/search.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { USER_SEARCH_FIELDS } from '../membership/membership.dto.js';

export type ListUsersArgs = {
  skip: number;
  take: number;
  orderBy: Prisma.UserOrderByWithRelationInput[];
  where: Prisma.UserWhereInput;
  q?: string;
};

export type PublicUser = Pick<
  User,
  | 'id'
  | 'email'
  | 'name'
  | 'emailVerified'
  | 'image'
  | 'createdAt'
  | 'updatedAt'
>;

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    image: user.image,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    args: ListUsersArgs = {
      skip: 0,
      take: 20,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
      where: {},
    },
  ): Promise<{ items: PublicUser[]; total: number }> {
    const search = buildSearchWhere(
      args.q,
      USER_SEARCH_FIELDS,
    ) as Prisma.UserWhereInput;
    const where = mergeWhere(args.where, search) as Prisma.UserWhereInput;

    const [rows, total] = await Promise.all([
      this.prisma.client.user.findMany({
        where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.client.user.count({ where }),
    ]);
    return { items: rows.map(toPublicUser), total };
  }

  async get(id: string): Promise<PublicUser> {
    const row = await this.prisma.client.user.findFirst({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(row);
  }
}
