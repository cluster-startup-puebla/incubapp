import {
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { runWithRequestContext } from '../context/request-context.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MembershipService } from './membership.service.js';
import { MembershipsHttpService } from './memberships-http.service.js';
import { inviteMembershipSchema } from './membership.dto.js';

const INC_A = '01900000-0000-7000-8000-0000000000aa';
const INC_B = '01900000-0000-7000-8000-0000000000bb';

type UserRow = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image: string | null;
  isSuperAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
};

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

type InvitationRow = {
  id: string;
  email: string;
  tokenHash: string;
  role: string;
  scopeType: 'incubator' | 'cluster';
  scopeId: string;
  membershipId: string;
  invitedById: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createFixture() {
  const users: UserRow[] = [];
  const memberships: MembershipRow[] = [];
  const invitations: InvitationRow[] = [];
  const incubators = [
    { id: INC_A, deletedAt: null },
    { id: INC_B, deletedAt: null },
  ];
  const signUpCalls: Array<{ email: string; password: string; name: string }> =
    [];

  const prisma = {
    client: {
      user: {
        findUnique(args: { where: { email?: string; id?: string } }) {
          const row = users.find((u) =>
            args.where.email
              ? u.email === args.where.email
              : u.id === args.where.id,
          );
          return Promise.resolve(row ?? null);
        },
      },
      incubator: {
        findFirst(args: { where: { id: string } }) {
          const row = incubators.find(
            (i) => i.id === args.where.id && i.deletedAt === null,
          );
          return Promise.resolve(row ?? null);
        },
      },
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
          const duplicate = memberships.some(
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
            id: `mem-${memberships.length + 1}`,
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
          memberships.push(row);
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
            memberships.filter((row) => {
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
            memberships.find(
              (row) => row.id === args?.where?.id && row.deletedAt === null,
            ) ?? null,
          );
        },
        delete(args: { where: { id: string } }) {
          const row = memberships.find((r) => r.id === args.where.id);
          if (!row) {
            return Promise.reject(new Error('missing'));
          }
          row.deletedAt = new Date();
          return Promise.resolve(row);
        },
        count() {
          return Promise.resolve(
            memberships.filter((r) => r.deletedAt === null).length,
          );
        },
      },
      membershipInvitation: {
        create(args: {
          data: {
            email: string;
            tokenHash: string;
            role: string;
            scopeType: 'incubator' | 'cluster';
            scopeId: string;
            membershipId: string;
            invitedById: string | null;
            expiresAt: Date;
          };
        }) {
          const row: InvitationRow = {
            id: `inv-${invitations.length + 1}`,
            ...args.data,
            acceptedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          invitations.push(row);
          return Promise.resolve(row);
        },
        findFirst(args: { where: { id: string } }) {
          return Promise.resolve(
            invitations.find((row) => row.id === args.where.id) ?? null,
          );
        },
        update(args: { where: { id: string }; data: { acceptedAt: Date } }) {
          const row = invitations.find((r) => r.id === args.where.id);
          if (!row) {
            return Promise.reject(new Error('missing'));
          }
          row.acceptedAt = args.data.acceptedAt;
          row.updatedAt = new Date();
          return Promise.resolve(row);
        },
      },
    },
  } as unknown as PrismaService;

  const authService = {
    api: {
      signUpEmail({
        body,
      }: {
        body: { email: string; password: string; name: string };
      }) {
        signUpCalls.push(body);
        const row: UserRow = {
          id: `user-${users.length + 1}`,
          email: body.email,
          name: body.name,
          emailVerified: false,
          image: null,
          isSuperAdmin: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        users.push(row);
        return Promise.resolve({ user: { id: row.id, email: row.email } });
      },
    },
  };

  const membershipService = new MembershipService(prisma);
  const service = new MembershipsHttpService(
    prisma,
    membershipService,
    authService as never,
  );

  return {
    service,
    membershipService,
    users,
    memberships,
    invitations,
    signUpCalls,
    seedUser(email: string) {
      const row: UserRow = {
        id: `user-existing-${users.length + 1}`,
        email,
        name: 'Existing',
        emailVerified: true,
        image: null,
        isSuperAdmin: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      users.push(row);
      return row;
    },
  };
}

describe('T6.4 memberships domain', () => {
  it('invitar email nuevo', async () => {
    const fx = createFixture();
    const result = await runWithRequestContext(
      {
        userId: 'actor-1',
        actorId: 'actor-1',
        incubatorId: null,
        isSuperAdmin: true,
      },
      () =>
        fx.service.invite({
          email: 'new@example.com',
          role: 'mentor',
          scopeType: 'incubator',
          scopeId: INC_A,
          actorRoles: [],
        }),
    );

    expect(result.createdUser).toBe(true);
    expect(result.user.email).toBe('new@example.com');
    expect(result.membership.role).toBe('mentor');
    expect(result.invitationToken.length).toBeGreaterThan(10);
    expect(fx.signUpCalls).toHaveLength(1);
    expect(fx.signUpCalls[0].password.length).toBeGreaterThanOrEqual(10);
    expect(fx.invitations).toHaveLength(1);
    expect(fx.invitations[0].tokenHash).toBe(hashToken(result.invitationToken));
  });

  it('invitar existente', async () => {
    const fx = createFixture();
    const existing = fx.seedUser('known@example.com');
    const result = await runWithRequestContext(
      {
        userId: 'actor-1',
        actorId: 'actor-1',
        incubatorId: null,
        isSuperAdmin: true,
      },
      () =>
        fx.service.invite({
          email: 'known@example.com',
          role: 'staff',
          scopeType: 'incubator',
          scopeId: INC_A,
          actorRoles: [],
        }),
    );

    expect(result.createdUser).toBe(false);
    expect(result.user.id).toBe(existing.id);
    expect(fx.signUpCalls).toHaveLength(0);
    expect(fx.users).toHaveLength(1);
    expect(fx.memberships).toHaveLength(1);
  });

  it('escalada director cluster_admin', async () => {
    const fx = createFixture();
    await expect(
      runWithRequestContext(
        {
          userId: 'director-1',
          actorId: 'director-1',
          incubatorId: INC_A,
          isSuperAdmin: false,
        },
        () =>
          fx.service.invite({
            email: 'evil@example.com',
            role: 'cluster_admin',
            scopeType: 'incubator',
            scopeId: INC_A,
            actorRoles: ['director'],
          }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fx.signUpCalls).toHaveLength(0);
    expect(fx.memberships).toHaveLength(0);
  });

  it('director incubadora ajena 404', async () => {
    const fx = createFixture();
    await expect(
      runWithRequestContext(
        {
          userId: 'director-1',
          actorId: 'director-1',
          incubatorId: INC_A,
          isSuperAdmin: false,
        },
        () =>
          fx.service.invite({
            email: 'other@example.com',
            role: 'mentor',
            scopeType: 'incubator',
            scopeId: INC_B,
            actorRoles: ['director'],
          }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ultimo director', async () => {
    const fx = createFixture();
    const created = await fx.membershipService.create({
      userId: 'dir-only',
      scopeType: 'incubator',
      scopeId: INC_A,
      role: 'director',
    });
    await expect(
      runWithRequestContext(
        {
          userId: 'admin',
          actorId: 'admin',
          incubatorId: null,
          isSuperAdmin: true,
        },
        () => fx.service.remove(created.id),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fx.memberships[0].deletedAt).toBeNull();
  });

  it('invitacion vencida', async () => {
    const fx = createFixture();
    const invited = await runWithRequestContext(
      {
        userId: 'actor-1',
        actorId: 'actor-1',
        incubatorId: null,
        isSuperAdmin: true,
      },
      () =>
        fx.service.invite({
          email: 'late@example.com',
          role: 'judge',
          scopeType: 'incubator',
          scopeId: INC_A,
          actorRoles: [],
        }),
    );
    fx.invitations[0].expiresAt = new Date(Date.now() - 60_000);

    await expect(
      fx.service.acceptInvitation(
        invited.invitation.id,
        invited.invitationToken,
      ),
    ).rejects.toBeInstanceOf(GoneException);
    expect(fx.invitations[0].acceptedAt).toBeNull();
  });

  it('token ajeno', async () => {
    const fx = createFixture();
    const first = await runWithRequestContext(
      {
        userId: 'actor-1',
        actorId: 'actor-1',
        incubatorId: null,
        isSuperAdmin: true,
      },
      () =>
        fx.service.invite({
          email: 'a@example.com',
          role: 'mentor',
          scopeType: 'incubator',
          scopeId: INC_A,
          actorRoles: [],
        }),
    );
    const second = await runWithRequestContext(
      {
        userId: 'actor-1',
        actorId: 'actor-1',
        incubatorId: null,
        isSuperAdmin: true,
      },
      () =>
        fx.service.invite({
          email: 'b@example.com',
          role: 'staff',
          scopeType: 'incubator',
          scopeId: INC_A,
          actorRoles: [],
        }),
    );

    await expect(
      fx.service.acceptInvitation(first.invitation.id, second.invitationToken),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fx.invitations[0].acceptedAt).toBeNull();
  });

  it('invite dto rechaza email invalido', () => {
    const parsed = inviteMembershipSchema.safeParse({
      email: 'not-an-email',
      role: 'mentor',
      scopeType: 'incubator',
      scopeId: INC_A,
    });
    expect(parsed.success).toBe(false);
  });
});
