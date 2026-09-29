import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  assertNoForbiddenWriteFields,
  nonEmptyString,
} from '../common/validation/zod-helpers.js';

const stageInput = z
  .object({
    name: nonEmptyString,
    sortOrder: z.number().int().min(1),
  })
  .strict();

const metricDefInput = z
  .object({
    key: nonEmptyString
      .regex(
        /^[a-z][a-z0-9_]{0,63}$/,
        'key must be lowercase snake_case starting with a letter',
      )
      .max(64),
    name: nonEmptyString,
    allowNegative: z.boolean().optional(),
  })
  .strict();

export const createFrameworkSchema = z
  .object({
    name: nonEmptyString,
    majorVersion: z.number().int().min(1).optional(),
    stages: z.array(stageInput).optional(),
    metricDefs: z.array(metricDefInput).optional(),
  })
  .strict();

const updateFrameworkObjectSchema = z
  .object({
    name: nonEmptyString.optional(),
  })
  .strict();

export const updateFrameworkSchema = updateFrameworkObjectSchema.refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required' },
);

export const createFrameworkStageSchema = z
  .object({
    name: nonEmptyString,
    sortOrder: z.number().int().min(1),
  })
  .strict();

assertNoForbiddenWriteFields(createFrameworkSchema);
assertNoForbiddenWriteFields(updateFrameworkObjectSchema);
assertNoForbiddenWriteFields(createFrameworkStageSchema);
assertNoForbiddenWriteFields(stageInput);
assertNoForbiddenWriteFields(metricDefInput);

export class CreateFrameworkDto extends createZodDto(createFrameworkSchema) {}
export class UpdateFrameworkDto extends createZodDto(updateFrameworkSchema) {}
export class CreateFrameworkStageDto extends createZodDto(
  createFrameworkStageSchema,
) {}

export const listFrameworksQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    q: z.string().optional(),
    filter: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export class ListFrameworksQueryDto extends createZodDto(
  listFrameworksQuerySchema,
) {}

export const FRAMEWORK_SORT_FIELDS = [
  'createdAt',
  'name',
  'majorVersion',
  'status',
  'id',
] as const;

export const FRAMEWORK_FILTERS = {
  name: { type: 'string' as const, operators: ['eq', 'in'] as const },
  status: { type: 'string' as const, operators: ['eq', 'in'] as const },
  majorVersion: {
    type: 'number' as const,
    operators: ['eq', 'gte', 'lte'] as const,
  },
  createdAt: {
    type: 'date' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq'] as const,
  },
};

export const FRAMEWORK_SEARCH_FIELDS = ['name'] as const;
