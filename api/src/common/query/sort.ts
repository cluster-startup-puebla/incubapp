import { BadRequestException } from '@nestjs/common';

export type SortDirection = 'asc' | 'desc';
export type SortClause = Record<string, SortDirection>;

const DEFAULT_SORT: SortClause[] = [{ createdAt: 'desc' }];

/**
 * Parses `sort=-createdAt,name` against a per-resource whitelist.
 * Relation paths like `user.email` are always rejected.
 */
export function parseSort(
  sort: unknown,
  whitelist: readonly string[],
): SortClause[] {
  if (sort === undefined || sort === null || sort === '') {
    return [...DEFAULT_SORT];
  }

  if (typeof sort !== 'string') {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [{ path: 'sort', message: 'sort must be a string' }],
    });
  }

  const allowed = new Set(whitelist);
  const clauses: SortClause[] = [];

  for (const raw of sort.split(',')) {
    const token = raw.trim();
    if (!token) {
      continue;
    }

    const descending = token.startsWith('-');
    const field = descending ? token.slice(1) : token;

    if (field.includes('.')) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            path: 'sort',
            message: `relation path "${field}" is not allowed`,
          },
        ],
      });
    }

    if (!allowed.has(field)) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            path: 'sort',
            message: `field "${field}" is not sortable`,
          },
        ],
      });
    }

    clauses.push({ [field]: descending ? 'desc' : 'asc' });
  }

  if (clauses.length === 0) {
    return [...DEFAULT_SORT];
  }

  return clauses;
}

export const STARTUP_SORT_FIELDS = ['createdAt', 'name', 'id'] as const;
