import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  assertNoForbiddenWriteFields,
  nonEmptyString,
} from '../common/validation/zod-helpers.js';

const createNotificationObjectSchema = z
  .object({
    userId: nonEmptyString,
    title: nonEmptyString,
    body: z.string().trim().min(1).optional().nullable(),
    /** When true, attempt email via MailerService (failure is recorded, not thrown). */
    attemptEmail: z.boolean().optional(),
    emailTo: z.string().trim().email().optional(),
  })
  .strict();

assertNoForbiddenWriteFields(createNotificationObjectSchema);

export const createNotificationSchema =
  createNotificationObjectSchema.superRefine((value, ctx) => {
    if (value.attemptEmail === true && !value.emailTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'emailTo is required when attemptEmail is true',
        path: ['emailTo'],
      });
    }
  });

export class CreateNotificationDto extends createZodDto(
  createNotificationSchema,
) {}

export const listNotificationsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    q: z.string().optional(),
    filter: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export class ListNotificationsQueryDto extends createZodDto(
  listNotificationsQuerySchema,
) {}

export const NOTIFICATION_SORT_FIELDS = ['createdAt', 'readAt', 'id'] as const;

export const NOTIFICATION_FILTERS = {
  readAt: {
    type: 'date' as const,
    operators: ['eq', 'gte', 'lte', 'gt', 'lt'] as const,
  },
  createdAt: {
    type: 'date' as const,
    operators: ['gte', 'lte', 'gt', 'lt', 'eq'] as const,
  },
};

export const NOTIFICATION_SEARCH_FIELDS = ['title', 'body'] as const;
