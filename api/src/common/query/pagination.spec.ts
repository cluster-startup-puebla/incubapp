import { BadRequestException } from '@nestjs/common';
import {
  decodeCursor,
  encodeCursor,
  parseCursorPagination,
  parseOffsetPagination,
  toCursorPage,
  toOffsetPage,
  withStableIdOrder,
} from './pagination.js';

describe('pagination', () => {
  it('pagina 1 y 2', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      id: `id-${String(i + 1).padStart(2, '0')}`,
    }));

    const page1 = parseOffsetPagination({ page: 1, pageSize: 20 });
    const page2 = parseOffsetPagination({ page: 2, pageSize: 20 });

    const slice1 = rows.slice(page1.skip, page1.skip + page1.take);
    const slice2 = rows.slice(page2.skip, page2.skip + page2.take);

    const ids = [...slice1, ...slice2].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(slice1).toHaveLength(20);
    expect(slice2).toHaveLength(5);
  });

  it('total sin borrados', () => {
    const active = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const totalActive = 3;
    // Soft-deleted rows are excluded by the Prisma extension before count.
    const page = toOffsetPage({
      items: active,
      total: totalActive,
      page: 1,
      pageSize: 20,
    });
    expect(page.meta.total).toBe(3);
    expect(page.data).toHaveLength(3);
  });

  it('pagina de mas', () => {
    const page = parseOffsetPagination({ page: 99, pageSize: 20 });
    const items: unknown[] = [];
    const result = toOffsetPage({
      items,
      total: 3,
      page: page.page,
      pageSize: page.pageSize,
    });
    expect(result.data).toEqual([]);
  });

  it('pageSize 0, 101, -1, abc', () => {
    for (const pageSize of [0, 101, -1, 'abc']) {
      expect(() => parseOffsetPagination({ pageSize })).toThrow(
        BadRequestException,
      );
    }
  });

  it('orden estable', () => {
    const orderBy = withStableIdOrder([{ createdAt: 'desc' as const }]);
    expect(orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);

    const sameCreatedAt = [
      { id: 'b', createdAt: new Date('2026-01-01') },
      { id: 'a', createdAt: new Date('2026-01-01') },
      { id: 'c', createdAt: new Date('2026-01-01') },
    ];
    const sorted = [...sameCreatedAt].sort((left, right) => {
      for (const clause of orderBy) {
        const [field, dir] = Object.entries(clause)[0] as [
          'id' | 'createdAt',
          'asc' | 'desc',
        ];
        const lv = left[field];
        const rv = right[field];
        if (lv < rv) return dir === 'asc' ? -1 : 1;
        if (lv > rv) return dir === 'asc' ? 1 : -1;
      }
      return 0;
    });
    expect(sorted.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('cursor invalido', () => {
    expect(() => decodeCursor('not-a-cursor!!!')).toThrow(BadRequestException);
    expect(() =>
      parseCursorPagination({ cursor: 'garbage', pageSize: 20 }),
    ).toThrow(BadRequestException);
  });

  it('cursor sin count', () => {
    const items = [
      { id: '1', createdAt: new Date('2026-01-01') },
      { id: '2', createdAt: new Date('2026-01-02') },
    ];
    const page = toCursorPage({ items, pageSize: 2 });
    expect(page.meta).not.toHaveProperty('total');
    expect(page.meta.nextCursor).toBe(
      encodeCursor({
        id: '2',
        createdAt: items[1].createdAt.toISOString(),
      }),
    );
  });
});
