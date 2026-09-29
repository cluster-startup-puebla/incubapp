import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  assertNoForbiddenWriteFields,
  nonEmptyString,
} from '../common/validation/zod-helpers.js';

export const INCUBATION_STATUSES = [
  'applied',
  'active',
  'graduated',
  'dropped',
] as const;

export type IncubationStatus = (typeof INCUBATION_STATUSES)[number];

export const incubationStatusSchema = z.enum(INCUBATION_STATUSES);

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .optional()
  .nullable();

function assertDatesOrdered(value: {
  startedOn?: string | null;
  endedOn?: string | null;
}): boolean {
  if (value.startedOn == null || value.endedOn == null) {
    return true;
  }
  return value.endedOn >= value.startedOn;
}

const createIncubationObjectSchema = z
  .object({
    status: incubationStatusSchema.optional(),
    startedOn: optionalDate,
    endedOn: optionalDate,
    exitReason: nonEmptyString.optional().nullable(),
  })
  .strict();

export const createIncubationSchema = createIncubationObjectSchema.refine(
  assertDatesOrdered,
  {
    message: 'endedOn must be on or after startedOn',
    path: ['endedOn'],
  },
);

const updateIncubationObjectSchema = z
  .object({
    status: incubationStatusSchema.optional(),
    startedOn: optionalDate,
    endedOn: optionalDate,
    exitReason: nonEmptyString.optional().nullable(),
  })
  .strict();

export const updateIncubationSchema = updateIncubationObjectSchema
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  })
  .refine(assertDatesOrdered, {
    message: 'endedOn must be on or after startedOn',
    path: ['endedOn'],
  });

assertNoForbiddenWriteFields(createIncubationObjectSchema);
assertNoForbiddenWriteFields(updateIncubationObjectSchema);

export class CreateIncubationDto extends createZodDto(createIncubationSchema) {}
export class UpdateIncubationDto extends createZodDto(updateIncubationSchema) {}

export const listIncubationsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    q: z.string().optional(),
    filter: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export class ListIncubationsQueryDto extends createZodDto(
  listIncubationsQuerySchema,
) {}

export const INCUBATION_SORT_FIELDS = [
  'createdAt',
  'status',
  'startedOn',
  'endedOn',
  'id',
] as const;

export const INCUBATION_FILTERS = {
  status: { type: 'string' as const, operators: ['eq', 'in'] as const },
  incubatorId: { type: 'string' as const, operators: ['eq', 'in'] as const },
  startedOn: {
    type: 'date' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq'] as const,
  },
  endedOn: {
    type: 'date' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq'] as const,
  },
  createdAt: {
    type: 'date' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq'] as const,
  },
};

export const INCUBATION_SEARCH_FIELDS = ['exitReason', 'status'] as const;

/** Valid status transitions: applied → active → graduated | dropped. */
export const INCUBATION_TRANSITIONS: Record<
  IncubationStatus,
  readonly IncubationStatus[]
> = {
  applied: ['active'],
  active: ['graduated', 'dropped'],
  graduated: [],
  dropped: [],
};
