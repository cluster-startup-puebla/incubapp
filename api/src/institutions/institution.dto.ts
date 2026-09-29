import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  assertNoForbiddenWriteFields,
  nonEmptyString,
} from '../common/validation/zod-helpers.js';

const countryCode = z
  .string()
  .trim()
  .length(2)
  .regex(/^[A-Za-z]{2}$/, 'countryCode must be ISO 3166-1 alpha-2')
  .transform((value) => value.toUpperCase());

const websiteUrl = z
  .string()
  .trim()
  .url({ message: 'website must be a valid URL' });

export const createInstitutionSchema = z
  .object({
    name: nonEmptyString,
    countryCode,
    website: websiteUrl.optional().nullable(),
  })
  .strict();

const updateInstitutionObjectSchema = z
  .object({
    name: nonEmptyString.optional(),
    countryCode: countryCode.optional(),
    website: websiteUrl.optional().nullable(),
  })
  .strict();

export const updateInstitutionSchema = updateInstitutionObjectSchema.refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required' },
);

assertNoForbiddenWriteFields(createInstitutionSchema);
assertNoForbiddenWriteFields(updateInstitutionObjectSchema);

export class CreateInstitutionDto extends createZodDto(
  createInstitutionSchema,
) {}
export class UpdateInstitutionDto extends createZodDto(
  updateInstitutionSchema,
) {}

export const listInstitutionsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    q: z.string().optional(),
    filter: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export class ListInstitutionsQueryDto extends createZodDto(
  listInstitutionsQuerySchema,
) {}

export const INSTITUTION_SORT_FIELDS = [
  'createdAt',
  'name',
  'countryCode',
  'id',
] as const;

export const INSTITUTION_FILTERS = {
  name: { type: 'string' as const, operators: ['eq', 'in'] as const },
  countryCode: { type: 'string' as const, operators: ['eq', 'in'] as const },
  createdAt: {
    type: 'date' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq'] as const,
  },
};

export const INSTITUTION_SEARCH_FIELDS = ['name'] as const;
