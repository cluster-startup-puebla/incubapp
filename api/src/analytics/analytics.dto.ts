import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const ymdDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

export const overviewQuerySchema = z
  .object({
    from: ymdDate.optional(),
    to: ymdDate.optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.from != null && value.to != null && value.from > value.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'from must be on or before to',
        path: ['from'],
      });
    }
  });

export class OverviewQueryDto extends createZodDto(overviewQuerySchema) {}

export type AnalyticsOverview = {
  incubators: number;
  stages: number;
  startups: number;
  funnel: {
    applied: number;
    active: number;
    graduated: number;
    dropped: number;
  };
};
