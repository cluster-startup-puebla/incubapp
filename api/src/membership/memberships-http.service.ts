import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { auth as AuthInstance } from '../auth.js';
import {
  currentIncubatorId,
  currentIsSuperAdmin,
  currentActorId,
} from '../context/request-context.js';
import type {
  Membership,
  MembershipInvitation,
  MembershipRole,
  MembershipScopeType,
  Prisma,
  User,
} from '../generated/prisma/client.js';
import { withStableIdOrder } from '../common/query/pagination.js';
import { mergeWhere } from '../common/query/search.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DIRECTOR_INVITE_ROLES } from './membership.dto.js';
import { MembershipService } from './membership.service.js';

const DEFAULT_INVITE_DAYS = 7;
const ELEVATED_ROLES = new Set(['cluster_admin', 'coorganizer']);

export type InviteMembershipInput = {
  email: string;
  role: MembershipRole;
  scopeType: MembershipScopeType;
  scopeId: string;
  name?: string;
  expiresInDays?: number;
  /** Roles of the inviting actor (from request.membershipRoles). */
  actorRoles: readonly string[];
};

export type InviteMembershipResult = {
  user: Pick<User, 'id' | 'email' | 'name' | 'emailVerified' | 'createdAt'>;
  membership: Membership;
  invitation: Pick<
    MembershipInvitation,
    | 'id'
    | 'email'
    | 'role'
    | 'scopeType'
    | 'scopeId'
    | 'expiresAt'
    | 'createdAt'
  >;
  /** Plain token returned once; never logged. */
  invitationToken: string;
  createdUser: boolean;
};

export type ListMembershipsArgs = {
  skip: number;
  take: number;
  orderBy: Prisma.MembershipOrderByWithRelationInput[];
  where: Prisma.MembershipWhereInput;
};

export type AcceptInvitationResult = {
  invitation: MembershipInvitation;
  membership: Membership;
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function randomInvitePassword(): string {
  return randomBytes(32).toString('base64url');
}

function randomInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class MembershipsHttpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipService,
    private readonly authService: AuthService<typeof AuthInstance>,
  ) {}

  /**
   * Directors may only touch memberships for their ALS incubator scope.
   * Super admin / elevated roles bypass. Foreign scope → 404 (not 403).
   */
  private assertScopeAccess(scopeType: MembershipScopeType, scopeId: string) {
    if (currentIsSuperAdmin()) {
      return;
    }
    if (scopeType !== 'incubator') {
      return;
    }
    const actorScope = currentIncubatorId();
    if (actorScope !== null && actorScope !== scopeId) {
      throw new NotFoundException('Membership not found');
    }
  }

  private scopeWhere(
    where: Prisma.MembershipWhereInput = {},
  ): Prisma.MembershipWhereInput {
    if (currentIsSuperAdmin()) {
      return where;
    }
    const scopeId = currentIncubatorId();
    if (scopeId === null) {
      return where;
    }
    return mergeWhere(where, {
      scopeType: 'incubator',
      scopeId,
    });
  }

  private assertInviteAuthorization(input: InviteMembershipInput): void {
    if (currentIsSuperAdmin()) {
      return;
    }

    const elevated = input.actorRoles.some((role) => ELEVATED_ROLES.has(role));
    if (elevated) {
      return;
    }

    const isDirector = input.actorRoles.includes('director');
    if (!isDirector) {
      // Matrix guard should already block; keep a hard deny.
      throw new ForbiddenException('Missing required permission');
    }

    if (input.role === 'cluster_admin') {
      throw new ForbiddenException('Directors cannot assign cluster_admin');
    }

    if (!(DIRECTOR_INVITE_ROLES as readonly string[]).includes(input.role)) {
      throw new ForbiddenException(
        'Directors may only invite staff, mentor, founder, or judge',
      );
    }

    if (input.scopeType !== 'incubator') {
      throw new ForbiddenException(
        'Directors may only invite into an incubator',
      );
    }

    const actorScope = currentIncubatorId();
    if (actorScope === null || actorScope !== input.scopeId) {
      // Foreign incubator id → 404 (IDOR posture), not 403.
      throw new NotFoundException('Incubator not found');
    }
  }

  async list(
    args: ListMembershipsArgs = {
      skip: 0,
      take: 20,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
      where: {},
    },
  ): Promise<{ items: Membership[]; total: number }> {
    const where = this.scopeWhere(args.where);
    const [items, total] = await Promise.all([
      this.prisma.client.membership.findMany({
        where,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.client.membership.count({ where }),
    ]);
    return { items, total };
  }

  async get(id: string): Promise<Membership> {
    const row = await this.memberships.get(id);
    this.assertScopeAccess(row.scopeType, row.scopeId);
    return row;
  }

  async invite(input: InviteMembershipInput): Promise<InviteMembershipResult> {
    this.assertInviteAuthorization(input);

    if (input.scopeType === 'incubator') {
      const incubator = await this.prisma.client.incubator.findFirst({
        where: { id: input.scopeId },
      });
      if (!incubator) {
        throw new NotFoundException('Incubator not found');
      }
    }

    const email = input.email.toLowerCase();
    let user = await this.prisma.client.user.findUnique({ where: { email } });
    let createdUser = false;

    if (!user) {
      const password = randomInvitePassword();
      const displayName =
        input.name?.trim() || email.split('@')[0] || 'Invited User';
      const signedUp = await this.authService.api.signUpEmail({
        body: {
          email,
          password,
          name: displayName,
        },
      });
      // Do not log password.
      const userId = signedUp?.user?.id;
      user = userId
        ? await this.prisma.client.user.findUnique({ where: { id: userId } })
        : await this.prisma.client.user.findUnique({ where: { email } });
      if (!user) {
        throw new ConflictException('Failed to create invited user');
      }
      createdUser = true;
    }

    const membership = await this.memberships.create({
      userId: user.id,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      role: input.role,
    });

    const invitationToken = randomInvitationToken();
    const days = input.expiresInDays ?? DEFAULT_INVITE_DAYS;
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + days);

    const invitation = await this.prisma.client.membershipInvitation.create({
      data: {
        email,
        tokenHash: hashToken(invitationToken),
        role: input.role,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        membershipId: membership.id,
        invitedById: currentActorId(),
        expiresAt,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      },
      membership,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        scopeType: invitation.scopeType,
        scopeId: invitation.scopeId,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      },
      invitationToken,
      createdUser,
    };
  }

  async acceptInvitation(
    invitationId: string,
    token: string,
    now: Date = new Date(),
  ): Promise<AcceptInvitationResult> {
    const invitation = await this.prisma.client.membershipInvitation.findFirst({
      where: { id: invitationId },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.tokenHash !== hashToken(token)) {
      throw new ForbiddenException('Invalid invitation token');
    }

    if (invitation.expiresAt.getTime() < now.getTime()) {
      throw new GoneException('Invitation has expired');
    }

    if (invitation.acceptedAt !== null) {
      const membership = await this.memberships.get(invitation.membershipId);
      return { invitation, membership };
    }

    const updated = await this.prisma.client.membershipInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: now },
    });
    const membership = await this.memberships.get(updated.membershipId);
    return { invitation: updated, membership };
  }

  async remove(id: string): Promise<Membership> {
    const existing = await this.get(id);

    if (existing.role === 'director' && existing.scopeType === 'incubator') {
      const activeDirectors = await this.memberships.countActiveByScopeRole(
        'incubator',
        existing.scopeId,
        'director',
      );
      if (activeDirectors <= 1) {
        throw new ConflictException(
          'Cannot remove the last active director of an incubator',
        );
      }
    }

    return this.memberships.softDelete(id);
  }
}
