import { ConflictException, NotFoundException } from '@nestjs/common';
import { isMembershipActive, MembershipService } from './membership.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

type MembershipRow = {
  id: string;
  userId: string;
  scopeType: 'incubator' | 'cluster';
  scopeId: string;
  role: string;
  validFrom: Date;
  validTo: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string | null;
  updatedById: string | null;
  deletedById: string | null;
  version: number;
};

function createMembershipPrismaMock() {
  const rows: MembershipRow[] = [];

  const prisma = {
    client: {
      membership: {
        create(args: {
          data: {
            userId: string;
            scopeType: 'incubator' | 'cluster';
            scopeId: string;
            role: string;
            validFrom: Date;
            validTo?: Date | null;
          };
        }) {
          const { data } = args;
          const duplicate = rows.some(
            (row) =>
              row.deletedAt === null &&
              row.userId === data.userId &&
              row.scopeType === data.scopeType &&
              row.scopeId === data.scopeId &&
              row.role === data.role,
          );
          if (duplicate) {
            return Promise.reject(
              Object.assign(new Error('Unique constraint'), { code: 'P2002' }),
            );
          }
          const row: MembershipRow = {
            id: `mem-${rows.length + 1}`,
            userId: data.userId,
            scopeType: data.scopeType,
            scopeId: data.scopeId,
            role: data.role,
            validFrom: data.validFrom,
            validTo: data.validTo ?? null,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdById: null,
            updatedById: null,
            deletedById: null,
            version: 1,
          };
          rows.push(row);
          return Promise.resolve(row);
        },
        findMany(args?: {
          where?: {
            userId?: string;
            scopeType?: string;
            scopeId?: string;
            role?: string;
          };
        }) {
          return Promise.resolve(
            rows.filter((row) => {
              if (row.deletedAt !== null) {
                return false;
              }
              const where = args?.where;
              if (!where) {
                return true;
              }
              if (where.userId && row.userId !== where.userId) {
                return false;
              }
              if (where.scopeType && row.scopeType !== where.scopeType) {
                return false;
              }
              if (where.scopeId && row.scopeId !== where.scopeId) {
                return false;
              }
              if (where.role && row.role !== where.role) {
                return false;
              }
              return true;
            }),
          );
        },
        findFirst(args?: { where?: { id?: string } }) {
          return Promise.resolve(
            rows.find(
              (row) => row.id === args?.where?.id && row.deletedAt === null,
            ) ?? null,
          );
        },
        delete(args: { where: { id: string } }) {
          const row = rows.find((r) => r.id === args.where.id);
          if (!row) {
            return Promise.reject(new Error('missing'));
          }
          row.deletedAt = new Date();
          return Promise.resolve(row);
        },
      },
    },
  } as unknown as PrismaService;

  return { prisma, rows };
}

describe('MembershipService', () => {
  const incubatorId = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';
  const userId = 'user-director-1';

  it('crear', async () => {
    const { prisma, rows } = createMembershipPrismaMock();
    const service = new MembershipService(prisma);
    const created = await service.create({
      userId,
      scopeType: 'incubator',
      scopeId: incubatorId,
      role: 'director',
    });
    expect(created.role).toBe('director');
    expect(rows).toHaveLength(1);
    expect(isMembershipActive(created)).toBe(true);
  });

  it('duplicado activo', async () => {
    const { prisma } = createMembershipPrismaMock();
    const service = new MembershipService(prisma);
    await service.create({
      userId,
      scopeType: 'incubator',
      scopeId: incubatorId,
      role: 'director',
    });
    await expect(
      service.create({
        userId,
        scopeType: 'incubator',
        scopeId: incubatorId,
        role: 'director',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('validTo pasado', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(
      isMembershipActive({
        validFrom: new Date(0),
        validTo: yesterday,
        deletedAt: null,
      }),
    ).toBe(false);
  });

  it('soft delete', async () => {
    const { prisma } = createMembershipPrismaMock();
    const service = new MembershipService(prisma);
    const created = await service.create({
      userId,
      scopeType: 'incubator',
      scopeId: incubatorId,
      role: 'mentor',
    });
    await service.softDelete(created.id);
    const active = await service.listActive(userId);
    expect(active.map((row) => row.id)).not.toContain(created.id);
  });

  it('mismo role tras borrar', async () => {
    const { prisma } = createMembershipPrismaMock();
    const service = new MembershipService(prisma);
    const first = await service.create({
      userId,
      scopeType: 'incubator',
      scopeId: incubatorId,
      role: 'staff',
    });
    await service.softDelete(first.id);
    const second = await service.create({
      userId,
      scopeType: 'incubator',
      scopeId: incubatorId,
      role: 'staff',
    });
    expect(second.id).not.toBe(first.id);
    expect(await service.listActive(userId)).toHaveLength(1);
  });

  it('soft delete missing', async () => {
    const { prisma } = createMembershipPrismaMock();
    const service = new MembershipService(prisma);
    await expect(service.softDelete('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('countActiveByScopeRole', async () => {
    const { prisma } = createMembershipPrismaMock();
    const service = new MembershipService(prisma);
    await service.create({
      userId: 'd1',
      scopeType: 'incubator',
      scopeId: incubatorId,
      role: 'director',
    });
    await service.create({
      userId: 'd2',
      scopeType: 'incubator',
      scopeId: incubatorId,
      role: 'director',
    });
    await service.create({
      userId: 's1',
      scopeType: 'incubator',
      scopeId: incubatorId,
      role: 'staff',
    });
    expect(
      await service.countActiveByScopeRole(
        'incubator',
        incubatorId,
        'director',
      ),
    ).toBe(2);
  });
});
