import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  assertNoForbiddenWriteFields,
  nonEmptyString,
} from '../common/validation/zod-helpers.js';

export const STARTUP_VISIBILITIES = [
  'PRIVATE',
  'INCUBATOR',
  'CLUSTER',
  'PUBLIC',
] as const;

export const startupVisibilitySchema = z.enum(STARTUP_VISIBILITIES);

export const createStartupSchema = z
  .object({
    name: nonEmptyString,
    domain: nonEmptyString,
    visibility: startupVisibilitySchema.optional(),
  })
  .strict();

const updateStartupObjectSchema = z
  .object({
    name: nonEmptyString.optional(),
    domain: nonEmptyString.optional(),
    visibility: startupVisibilitySchema.optional(),
  })
  .strict();

export const updateStartupSchema = updateStartupObjectSchema.refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required' },
);

assertNoForbiddenWriteFields(createStartupSchema);
assertNoForbiddenWriteFields(updateStartupObjectSchema);

export class CreateStartupDto extends createZodDto(createStartupSchema) {}
export class UpdateStartupDto extends createZodDto(updateStartupSchema) {}

export const listStartupsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    q: z.string().optional(),
    // Nested filter[field] arrives as an object from the query parser.
    filter: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export class ListStartupsQueryDto extends createZodDto(
  listStartupsQuerySchema,
) {}

export const createStartupQuerySchema = z
  .object({
    force: z
      .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
      .optional()
      .transform((value) => {
        if (value === undefined) return false;
        if (typeof value === 'boolean') return value;
        return value === 'true' || value === '1';
      }),
  })
  .passthrough();

export class CreateStartupQueryDto extends createZodDto(
  createStartupQuerySchema,
) {}

export const STARTUP_SORT_FIELDS = [
  'createdAt',
  'name',
  'domain',
  'id',
] as const;

export const STARTUP_FILTERS = {
  name: { type: 'string' as const, operators: ['eq', 'in'] as const },
  domain: { type: 'string' as const, operators: ['eq', 'in'] as const },
  visibility: { type: 'string' as const, operators: ['eq', 'in'] as const },
  ownerUserId: { type: 'string' as const, operators: ['eq', 'in'] as const },
  createdAt: {
    type: 'date' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq'] as const,
  },
};

export const STARTUP_SEARCH_FIELDS = ['name', 'domain'] as const;
