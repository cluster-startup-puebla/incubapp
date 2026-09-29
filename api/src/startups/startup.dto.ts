import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  assertNoForbiddenWriteFields,
  nonEmptyString,
} from '../common/validation/zod-helpers.js';

export const createStartupSchema = z
  .object({
    name: nonEmptyString,
    ownerUserId: z.string().nullable().optional(),
  })
  .strict();

const updateStartupObjectSchema = z
  .object({
    name: nonEmptyString.optional(),
    ownerUserId: z.string().nullable().optional(),
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
    // Nested filter[field] arrives as an object from the query parser.
    filter: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export class ListStartupsQueryDto extends createZodDto(
  listStartupsQuerySchema,
) {}
