import { BadRequestException } from '@nestjs/common';

export const SEARCH_MIN_LENGTH = 2;

/**
 * Escapes LIKE / ILIKE wildcards so `q=%` does not match everything.
 * Postgres default LIKE escape character is backslash.
 */
export function escapeLikeWildcards(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Builds a Prisma OR-of-contains where for `q`.
 * Empty/whitespace q → no clause. Length < 2 → 400.
 */
export function buildSearchWhere(
  q: string | undefined | null,
  fields: readonly string[],
): Record<string, unknown> {
  if (q === undefined || q === null) {
    return {};
  }
  const trimmed = q.trim();
  if (trimmed === '') {
    return {};
  }
  if (trimmed.length < SEARCH_MIN_LENGTH) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [
        {
          path: 'q',
          message: `q must be at least ${SEARCH_MIN_LENGTH} characters`,
        },
      ],
    });
  }

  const escaped = escapeLikeWildcards(trimmed);
  return {
    OR: fields.map((field) => ({
      [field]: { contains: escaped, mode: 'insensitive' },
    })),
  };
}

export function mergeWhere(
  ...parts: Array<Record<string, unknown> | undefined>
): Record<string, unknown> {
  const nonEmpty = parts.filter(
    (part): part is Record<string, unknown> =>
      part !== undefined && Object.keys(part).length > 0,
  );
  if (nonEmpty.length === 0) {
    return {};
  }
  if (nonEmpty.length === 1) {
    return nonEmpty[0];
  }
  return { AND: nonEmpty };
}
