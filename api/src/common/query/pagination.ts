import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const pageSchema = z.coerce.number().int().min(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(MAX_PAGE_SIZE);

export type OffsetPagination = {
  mode: 'offset';
  page: number;
  pageSize: number;
  skip: number;
  take: number;
};

export type CursorPagination = {
  mode: 'cursor';
  cursor: string;
  pageSize: number;
  take: number;
};

export type ParsedPagination = OffsetPagination | CursorPagination;

export type OffsetListMeta = {
  page: number;
  pageSize: number;
  total: number;
};

export type CursorListMeta = {
  pageSize: number;
  nextCursor: string | null;
};

/**
 * Offset pagination for ordinary list resources.
 * Do not use this helper for audit logs or metric readings (cursor-only).
 */
export function parseOffsetPagination(input: {
  page?: unknown;
  pageSize?: unknown;
}): OffsetPagination {
  const pageResult = pageSchema.safeParse(
    input.page === undefined || input.page === '' ? DEFAULT_PAGE : input.page,
  );
  if (!pageResult.success) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [{ path: 'page', message: 'page must be an integer >= 1' }],
    });
  }

  const pageSizeResult = pageSizeSchema.safeParse(
    input.pageSize === undefined || input.pageSize === ''
      ? DEFAULT_PAGE_SIZE
      : input.pageSize,
  );
  if (!pageSizeResult.success) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [
        {
          path: 'pageSize',
          message: `pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`,
        },
      ],
    });
  }

  const page = pageResult.data;
  const pageSize = pageSizeResult.data;
  return {
    mode: 'offset',
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function parseCursorPagination(input: {
  cursor?: unknown;
  pageSize?: unknown;
}): CursorPagination {
  const pageSizeResult = pageSizeSchema.safeParse(
    input.pageSize === undefined || input.pageSize === ''
      ? DEFAULT_PAGE_SIZE
      : input.pageSize,
  );
  if (!pageSizeResult.success) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [
        {
          path: 'pageSize',
          message: `pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`,
        },
      ],
    });
  }

  if (
    input.cursor === undefined ||
    input.cursor === null ||
    input.cursor === ''
  ) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [
        { path: 'cursor', message: 'cursor is required in cursor mode' },
      ],
    });
  }

  if (typeof input.cursor !== 'string') {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [{ path: 'cursor', message: 'cursor must be a string' }],
    });
  }

  decodeCursor(input.cursor);

  return {
    mode: 'cursor',
    cursor: input.cursor,
    pageSize: pageSizeResult.data,
    take: pageSizeResult.data,
  };
}

export type CursorPayload = {
  id: string;
  createdAt: string;
};

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { id?: unknown }).id !== 'string' ||
      typeof (parsed as { createdAt?: unknown }).createdAt !== 'string'
    ) {
      throw new Error('invalid shape');
    }
    return {
      id: (parsed as CursorPayload).id,
      createdAt: (parsed as CursorPayload).createdAt,
    };
  } catch {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [{ path: 'cursor', message: 'invalid cursor' }],
    });
  }
}

export type OffsetPageArgs<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Builds offset list result. Soft-deleted rows must already be excluded from
 * `items` and `total` by the caller (Prisma soft-delete extension).
 */
export function toOffsetPage<T>(args: OffsetPageArgs<T>): {
  data: T[];
  meta: OffsetListMeta;
} {
  return {
    data: args.items,
    meta: {
      page: args.page,
      pageSize: args.pageSize,
      total: args.total,
    },
  };
}

export type CursorPageArgs<T extends { id: string; createdAt: Date }> = {
  items: T[];
  pageSize: number;
};

/**
 * Cursor lists never include `total` (audit logs / metric readings).
 */
export function toCursorPage<T extends { id: string; createdAt: Date }>(
  args: CursorPageArgs<T>,
): { data: T[]; meta: CursorListMeta } {
  const last = args.items[args.items.length - 1];
  const nextCursor =
    args.items.length === args.pageSize && last
      ? encodeCursor({
          id: last.id,
          createdAt: last.createdAt.toISOString(),
        })
      : null;

  return {
    data: args.items,
    meta: {
      pageSize: args.pageSize,
      nextCursor,
    },
  };
}

/** Stable orderBy: primary fields plus id tie-breaker. */
export function withStableIdOrder<T extends Record<string, 'asc' | 'desc'>>(
  orderBy: T[],
): Array<T | { id: 'asc' | 'desc' }> {
  const hasId = orderBy.some((clause) => 'id' in clause);
  if (hasId) {
    return orderBy;
  }
  const primaryDir =
    Object.values(orderBy[0] ?? { createdAt: 'desc' })[0] ?? 'desc';
  return [...orderBy, { id: primaryDir }];
}
