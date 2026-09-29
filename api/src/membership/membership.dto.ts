import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  assertNoForbiddenWriteFields,
  nonEmptyString,
} from '../common/validation/zod-helpers.js';

export const MEMBERSHIP_ROLES = [
  'cluster_admin',
  'coorganizer',
  'director',
  'staff',
  'mentor',
  'founder',
  'judge',
] as const;

export const DIRECTOR_INVITE_ROLES = [
  'staff',
  'mentor',
  'founder',
  'judge',
] as const;

const membershipRole = z.enum(MEMBERSHIP_ROLES);
const scopeType = z.enum(['incubator', 'cluster']);

export const inviteMembershipSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .transform((v) => v.toLowerCase()),
    role: membershipRole,
    scopeType,
    scopeId: z.string().uuid(),
    name: nonEmptyString.optional(),
    expiresInDays: z.coerce.number().int().min(1).max(90).optional(),
  })
  .strict();

assertNoForbiddenWriteFields(inviteMembershipSchema);

export class InviteMembershipDto extends createZodDto(inviteMembershipSchema) {}

export const acceptInvitationSchema = z
  .object({
    token: nonEmptyString,
  })
  .strict();

assertNoForbiddenWriteFields(acceptInvitationSchema);

export class AcceptInvitationDto extends createZodDto(acceptInvitationSchema) {}

export const listMembershipsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    q: z.string().optional(),
    filter: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export class ListMembershipsQueryDto extends createZodDto(
  listMembershipsQuerySchema,
) {}

export const MEMBERSHIP_SORT_FIELDS = [
  'createdAt',
  'role',
  'validFrom',
  'id',
] as const;

export const MEMBERSHIP_FILTERS = {
  role: { type: 'string' as const, operators: ['eq', 'in'] as const },
  scopeType: { type: 'string' as const, operators: ['eq', 'in'] as const },
  scopeId: { type: 'string' as const, operators: ['eq', 'in'] as const },
  userId: { type: 'string' as const, operators: ['eq', 'in'] as const },
  createdAt: {
    type: 'date' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq'] as const,
  },
};

export const listUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    q: z.string().optional(),
    filter: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export class ListUsersQueryDto extends createZodDto(listUsersQuerySchema) {}

export const USER_SORT_FIELDS = ['createdAt', 'email', 'name', 'id'] as const;

export const USER_FILTERS = {
  email: { type: 'string' as const, operators: ['eq', 'in'] as const },
  name: { type: 'string' as const, operators: ['eq', 'in'] as const },
  createdAt: {
    type: 'date' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq'] as const,
  },
};

export const USER_SEARCH_FIELDS = ['email', 'name'] as const;
