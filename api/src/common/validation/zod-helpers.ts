import { z } from 'zod';

/** Rejects whitespace-only strings after trim. */
export const nonEmptyString = z.string().trim().min(1);

/** Fields that must never appear on write DTOs (mass assignment). */
export const FORBIDDEN_WRITE_FIELDS = [
  'id',
  'deletedAt',
  'createdById',
  'incubatorId',
] as const;

export function assertNoForbiddenWriteFields(schema: {
  shape: Record<string, unknown>;
}): void {
  const shape = schema.shape;
  for (const field of FORBIDDEN_WRITE_FIELDS) {
    if (field in shape) {
      throw new Error(
        `Write DTO must not accept mass-assignment field "${field}"`,
      );
    }
  }
}
