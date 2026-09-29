import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  assertNoForbiddenWriteFields,
  nonEmptyString,
} from '../common/validation/zod-helpers.js';

export const GEO_UNIT_LEVELS = ['COUNTRY', 'STATE', 'MUNICIPALITY'] as const;

const geoUnitLevel = z.enum(GEO_UNIT_LEVELS);

const parentId = z.string().uuid().nullable();

export const createGeoUnitSchema = z
  .object({
    level: geoUnitLevel,
    code: nonEmptyString,
    name: nonEmptyString,
    parentId: parentId.optional(),
  })
  .strict();

const updateGeoUnitObjectSchema = z
  .object({
    code: nonEmptyString.optional(),
    name: nonEmptyString.optional(),
    parentId: parentId.optional(),
  })
  .strict();

export const updateGeoUnitSchema = updateGeoUnitObjectSchema.refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required' },
);

assertNoForbiddenWriteFields(createGeoUnitSchema);
assertNoForbiddenWriteFields(updateGeoUnitObjectSchema);

export class CreateGeoUnitDto extends createZodDto(createGeoUnitSchema) {}
export class UpdateGeoUnitDto extends createZodDto(updateGeoUnitSchema) {}

export const listGeoUnitsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    q: z.string().optional(),
    filter: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export class ListGeoUnitsQueryDto extends createZodDto(
  listGeoUnitsQuerySchema,
) {}

export const GEO_UNIT_SORT_FIELDS = [
  'createdAt',
  'name',
  'code',
  'level',
  'id',
] as const;

export const GEO_UNIT_FILTERS = {
  name: { type: 'string' as const, operators: ['eq', 'in'] as const },
  code: { type: 'string' as const, operators: ['eq', 'in'] as const },
  level: { type: 'string' as const, operators: ['eq', 'in'] as const },
  parentId: { type: 'string' as const, operators: ['eq', 'in'] as const },
  createdAt: {
    type: 'date' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq'] as const,
  },
};

export const GEO_UNIT_SEARCH_FIELDS = ['name', 'code'] as const;
