import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  assertNoForbiddenWriteFields,
  nonEmptyString,
} from '../common/validation/zod-helpers.js';

const slug = nonEmptyString
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case')
  .max(100);

const latitude = z
  .number()
  .min(-90, 'latitude must be between -90 and 90')
  .max(90, 'latitude must be between -90 and 90');

const longitude = z
  .number()
  .min(-180, 'longitude must be between -180 and 180')
  .max(180, 'longitude must be between -180 and 180');

const institutionId = z.string().uuid().nullable();
const frameworkId = z.string().uuid().nullable();

const brandPrimary = z
  .string()
  .regex(
    /^(#[0-9a-fA-F]{3,8}|oklch\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\)|rgb\([^)]+\)|rgba\([^)]+\)|[a-zA-Z]+)$/,
    'brandPrimary must be a CSS color',
  )
  .nullable();

export const createIncubatorSchema = z
  .object({
    name: nonEmptyString,
    slug,
    latitude: latitude.optional().nullable(),
    longitude: longitude.optional().nullable(),
    brandPrimary: brandPrimary.optional(),
    institutionId: institutionId.optional().nullable(),
    frameworkId: frameworkId.optional().nullable(),
  })
  .strict();

const updateIncubatorObjectSchema = z
  .object({
    name: nonEmptyString.optional(),
    slug: slug.optional(),
    latitude: latitude.optional().nullable(),
    longitude: longitude.optional().nullable(),
    brandPrimary: brandPrimary.optional(),
    institutionId: institutionId.optional().nullable(),
    frameworkId: frameworkId.optional().nullable(),
  })
  .strict();

export const updateIncubatorSchema = updateIncubatorObjectSchema.refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required' },
);

assertNoForbiddenWriteFields(createIncubatorSchema);
assertNoForbiddenWriteFields(updateIncubatorObjectSchema);

export class CreateIncubatorDto extends createZodDto(createIncubatorSchema) {}
export class UpdateIncubatorDto extends createZodDto(updateIncubatorSchema) {}

export const listIncubatorsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    q: z.string().optional(),
    filter: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export class ListIncubatorsQueryDto extends createZodDto(
  listIncubatorsQuerySchema,
) {}

export const INCUBATOR_SORT_FIELDS = [
  'createdAt',
  'name',
  'slug',
  'id',
] as const;

export const INCUBATOR_FILTERS = {
  name: { type: 'string' as const, operators: ['eq', 'in'] as const },
  slug: { type: 'string' as const, operators: ['eq', 'in'] as const },
  institutionId: { type: 'string' as const, operators: ['eq', 'in'] as const },
  frameworkId: { type: 'string' as const, operators: ['eq', 'in'] as const },
  createdAt: {
    type: 'date' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq'] as const,
  },
};

export const INCUBATOR_SEARCH_FIELDS = ['name', 'slug'] as const;
