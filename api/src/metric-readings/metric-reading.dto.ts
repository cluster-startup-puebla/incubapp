import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { assertNoForbiddenWriteFields } from '../common/validation/zod-helpers.js';

const uuid = z.string().uuid();

const periodDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

export const upsertMetricReadingSchema = z
  .object({
    metricDefId: uuid,
    period: periodDate,
    value: z.number().finite(),
  })
  .strict();

assertNoForbiddenWriteFields(upsertMetricReadingSchema);

export class UpsertMetricReadingDto extends createZodDto(
  upsertMetricReadingSchema,
) {}

export const listMetricReadingsQuerySchema = z
  .object({
    cursor: z.string().optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    filter: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export class ListMetricReadingsQueryDto extends createZodDto(
  listMetricReadingsQuerySchema,
) {}

export const METRIC_READING_FILTERS = {
  metricDefId: { type: 'string' as const, operators: ['eq', 'in'] as const },
  period: {
    type: 'date' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq'] as const,
  },
  verifiedAt: {
    type: 'date' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq'] as const,
  },
};
