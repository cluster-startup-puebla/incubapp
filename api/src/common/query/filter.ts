import { BadRequestException } from '@nestjs/common';

export type FilterOperator = 'eq' | 'gte' | 'lte' | 'gt' | 'lt' | 'in';

export type FilterFieldConfig = {
  type: 'string' | 'number' | 'boolean' | 'date';
  operators?: readonly FilterOperator[];
};

const DEFAULT_OPERATORS: readonly FilterOperator[] = [
  'eq',
  'gte',
  'lte',
  'gt',
  'lt',
  'in',
];

export const MAX_IN_VALUES = 200;

export type FilterWhitelist = Record<string, FilterFieldConfig>;

type PrismaWhere = Record<string, unknown>;

function parseScalar(
  field: string,
  type: FilterFieldConfig['type'],
  raw: unknown,
): string | number | boolean | Date {
  if (type === 'string') {
    if (typeof raw !== 'string') {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [{ path: `filter.${field}`, message: 'expected string' }],
      });
    }
    return raw;
  }

  if (type === 'number') {
    const num = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(num)) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [{ path: `filter.${field}`, message: 'expected number' }],
      });
    }
    return num;
  }

  if (type === 'boolean') {
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [{ path: `filter.${field}`, message: 'expected boolean' }],
    });
  }

  // date
  if (typeof raw !== 'string' && !(raw instanceof Date)) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [{ path: `filter.${field}`, message: 'expected date' }],
    });
  }
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [{ path: `filter.${field}`, message: 'invalid date' }],
    });
  }
  return date;
}

function assertOperatorAllowed(
  field: string,
  operator: string,
  allowed: readonly FilterOperator[],
): asserts operator is FilterOperator {
  if (!allowed.includes(operator as FilterOperator)) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [
        {
          path: `filter.${field}`,
          message: `operator "${operator}" is not allowed`,
        },
      ],
    });
  }
}

/**
 * Builds a Prisma `where` object from `filter[field]` / `filter[field][op]`.
 * Values stay as parameters on the object — never concatenated into SQL.
 */
export function parseFilters(
  filter: unknown,
  whitelist: FilterWhitelist,
): PrismaWhere {
  if (filter === undefined || filter === null || filter === '') {
    return {};
  }

  if (typeof filter !== 'object' || Array.isArray(filter)) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [{ path: 'filter', message: 'filter must be an object' }],
    });
  }

  const where: PrismaWhere = {};

  for (const [field, rawValue] of Object.entries(
    filter as Record<string, unknown>,
  )) {
    const config = whitelist[field];
    if (!config) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            path: `filter.${field}`,
            message: `field "${field}" is not filterable`,
          },
        ],
      });
    }

    const operators = config.operators ?? DEFAULT_OPERATORS;

    if (
      typeof rawValue === 'object' &&
      rawValue !== null &&
      !Array.isArray(rawValue)
    ) {
      const clause: Record<string, unknown> = {};
      for (const [op, opValue] of Object.entries(
        rawValue as Record<string, unknown>,
      )) {
        assertOperatorAllowed(field, op, operators);

        if (op === 'in') {
          const values = parseInValues(field, config.type, opValue);
          clause.in = values;
        } else if (op === 'eq') {
          clause.equals = parseScalar(field, config.type, opValue);
        } else {
          clause[op] = parseScalar(field, config.type, opValue);
        }
      }
      where[field] = clause;
      continue;
    }

    assertOperatorAllowed(field, 'eq', operators);
    where[field] = parseScalar(field, config.type, rawValue);
  }

  return where;
}

function parseInValues(
  field: string,
  type: FilterFieldConfig['type'],
  raw: unknown,
): Array<string | number | boolean | Date> {
  let parts: unknown[];
  if (typeof raw === 'string') {
    parts = raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  } else if (Array.isArray(raw)) {
    parts = raw;
  } else {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [
        {
          path: `filter.${field}.in`,
          message: 'in expects a comma-separated string or array',
        },
      ],
    });
  }

  if (parts.length > MAX_IN_VALUES) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [
        {
          path: `filter.${field}.in`,
          message: `in accepts at most ${MAX_IN_VALUES} values`,
        },
      ],
    });
  }

  return parts.map((part) => parseScalar(field, type, part));
}

/** @deprecated Prefer STARTUP_FILTERS from startups/startup.dto.js */
export const STARTUP_FILTERS: FilterWhitelist = {
  name: { type: 'string', operators: ['eq', 'in'] },
  domain: { type: 'string', operators: ['eq', 'in'] },
  visibility: { type: 'string', operators: ['eq', 'in'] },
  createdAt: { type: 'date', operators: ['gte', 'lte', 'gt', 'lt', 'eq'] },
  ownerUserId: { type: 'string', operators: ['eq', 'in'] },
};
