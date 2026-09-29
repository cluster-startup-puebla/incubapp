import {
  applyListDeletedFilter,
  applyNestedSoftDeleteInclude,
  createSoftDeleteExtension,
  isSoftDeleteModel,
  SOFT_DELETE_MODELS,
  stripDeletedAtFromCreateManyData,
  stripDeletedAtFromData,
} from './soft-delete.extension.js';
import { currentUserId, runWithUser } from '../context/request-context.js';

type CapturedCall = {
  operation: string;
  args: Record<string, unknown>;
};

/**
 * Builds a fake Prisma-like delegate that records operations and lets the
 * soft-delete extension rewrite args without talking to Postgres.
 */
function createCapturingClient() {
  const calls: CapturedCall[] = [];

  const institutionRows = new Map<
    string,
    {
      id: string;
      name: string;
      countryCode: string;
      deletedAt: Date | null;
      createdById: string | null;
      updatedById: string | null;
      deletedById: string | null;
    }
  >();

  function matchesWhere(
    row: { id: string; deletedAt: Date | null },
    where: Record<string, unknown> | undefined,
  ): boolean {
    if (!where) {
      return true;
    }
    if (where.AND && Array.isArray(where.AND)) {
      return where.AND.every((part) =>
        matchesWhere(row, part as Record<string, unknown>),
      );
    }
    if (Object.prototype.hasOwnProperty.call(where, 'id')) {
      if (where.id !== row.id) {
        return false;
      }
    }
    if (Object.prototype.hasOwnProperty.call(where, 'deletedAt')) {
      const expected = where.deletedAt;
      if (expected === null) {
        if (row.deletedAt !== null) {
          return false;
        }
      } else if (
        expected &&
        typeof expected === 'object' &&
        'not' in expected &&
        expected.not === null
      ) {
        if (row.deletedAt === null) {
          return false;
        }
      }
    }
    return true;
  }

  const institution = {
    async findMany(args: Record<string, unknown> = {}) {
      await Promise.resolve();
      calls.push({ operation: 'findMany', args });
      return [...institutionRows.values()].filter((row) =>
        matchesWhere(row, args.where as Record<string, unknown>),
      );
    },
    async findFirst(args: Record<string, unknown> = {}) {
      await Promise.resolve();
      calls.push({ operation: 'findFirst', args });
      return (
        [...institutionRows.values()].find((row) =>
          matchesWhere(row, args.where as Record<string, unknown>),
        ) ?? null
      );
    },
    findFirstOrThrow(args: Record<string, unknown> = {}) {
      return institution.findFirst(args).then((row) => {
        if (!row) {
          throw new Error('Not found');
        }
        return row;
      });
    },
    findUnique(args: Record<string, unknown>) {
      calls.push({ operation: 'findUnique', args });
      return institution.findFirst(args);
    },
    async count(args: Record<string, unknown> = {}) {
      await Promise.resolve();
      calls.push({ operation: 'count', args });
      return [...institutionRows.values()].filter((row) =>
        matchesWhere(row, args.where as Record<string, unknown>),
      ).length;
    },
    async create(args: Record<string, unknown>) {
      await Promise.resolve();
      calls.push({ operation: 'create', args });
      const data = args.data as Record<string, unknown>;
      const row = {
        id: (data.id as string) ?? `id-${institutionRows.size + 1}`,
        name: data.name as string,
        countryCode: data.countryCode as string,
        deletedAt: (data.deletedAt as Date | null | undefined) ?? null,
        createdById: (data.createdById as string | null | undefined) ?? null,
        updatedById: (data.updatedById as string | null | undefined) ?? null,
        deletedById: (data.deletedById as string | null | undefined) ?? null,
      };
      institutionRows.set(row.id, row);
      return row;
    },
    async createMany(args: Record<string, unknown>) {
      await Promise.resolve();
      calls.push({ operation: 'createMany', args });
      return { count: Array.isArray(args.data) ? args.data.length : 1 };
    },
    async update(args: Record<string, unknown>) {
      await Promise.resolve();
      calls.push({ operation: 'update', args });
      const where = args.where as Record<string, unknown>;
      const row = [...institutionRows.values()].find((candidate) =>
        matchesWhere(candidate, where),
      );
      if (!row) {
        const error = new Error('Record to update not found.') as Error & {
          code: string;
        };
        error.code = 'P2025';
        throw error;
      }
      const data = args.data as Record<string, unknown>;
      Object.assign(row, data);
      return row;
    },
    async updateMany(args: Record<string, unknown>) {
      await Promise.resolve();
      calls.push({ operation: 'updateMany', args });
      const where = args.where as Record<string, unknown>;
      const data = args.data as Record<string, unknown>;
      let count = 0;
      for (const row of institutionRows.values()) {
        if (matchesWhere(row, where)) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    },
    async delete(args: Record<string, unknown>) {
      await Promise.resolve();
      calls.push({ operation: 'delete', args });
      throw new Error('physical delete should be rewritten');
    },
    async deleteMany(args: Record<string, unknown>) {
      await Promise.resolve();
      calls.push({ operation: 'deleteMany', args });
      throw new Error('physical deleteMany should be rewritten');
    },
    async aggregate(args: Record<string, unknown>) {
      await Promise.resolve();
      calls.push({ operation: 'aggregate', args });
      return {};
    },
    async groupBy(args: Record<string, unknown>) {
      await Promise.resolve();
      calls.push({ operation: 'groupBy', args });
      return [];
    },
    async upsert(args: Record<string, unknown>) {
      await Promise.resolve();
      calls.push({ operation: 'upsert', args });
      return args;
    },
    _seed(row: {
      id: string;
      name: string;
      countryCode: string;
      deletedAt: Date | null;
      createdById?: string | null;
      updatedById?: string | null;
      deletedById?: string | null;
    }) {
      institutionRows.set(row.id, {
        createdById: null,
        updatedById: null,
        deletedById: null,
        ...row,
      });
    },
    _rows: institutionRows,
  };

  return { institution, calls, institutionRows };
}

/** Mirrors the extension's create audit fill from RequestContext. */
function fillCreateAudit(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const next = stripDeletedAtFromData({ ...data });
  if (next.createdById === undefined) {
    (next as Record<string, unknown>).createdById = currentUserId();
  }
  return next;
}

/** Mirrors the extension's update audit fill from RequestContext. */
function fillUpdateAudit(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const next = stripDeletedAtFromData({ ...data });
  if (next.updatedById === undefined) {
    (next as Record<string, unknown>).updatedById = currentUserId();
  }
  return next;
}

describe('soft-delete query compiler', () => {
  it('lists SOFT_DELETE_MODELS with Institution', () => {
    expect(SOFT_DELETE_MODELS).toContain('Institution');
    expect(SOFT_DELETE_MODELS).toContain('GeoUnit');
    expect(SOFT_DELETE_MODELS).toContain('Framework');
    expect(SOFT_DELETE_MODELS).toContain('FrameworkStage');
    expect(SOFT_DELETE_MODELS).toContain('Milestone');
    expect(SOFT_DELETE_MODELS).toContain('MetricDef');
    expect(isSoftDeleteModel('Institution')).toBe(true);
    expect(isSoftDeleteModel('GeoUnit')).toBe(true);
    expect(isSoftDeleteModel('Framework')).toBe(true);
    expect(isSoftDeleteModel('Session')).toBe(false);
  });

  it('list oculta borrados', () => {
    const where = applyListDeletedFilter({ name: 'X' }, {});
    expect(where).toEqual({
      AND: [{ name: 'X' }, { deletedAt: null }],
    });
  });

  it('withDeleted', () => {
    const where = applyListDeletedFilter({ name: 'X' }, { withDeleted: true });
    expect(where).toEqual({ name: 'X' });
  });

  it('onlyDeleted', () => {
    const where = applyListDeletedFilter({}, { onlyDeleted: true });
    expect(where).toEqual({ deletedAt: { not: null } });
  });

  it('createMany con deletedAt', () => {
    const stripped = stripDeletedAtFromCreateManyData([
      { name: 'A', deletedAt: new Date() },
      { name: 'B', deletedAt: null },
    ]);
    expect(stripped).toEqual([{ name: 'A' }, { name: 'B' }]);
    expect(
      stripDeletedAtFromData({ name: 'A', deletedAt: new Date() }),
    ).toEqual({ name: 'A' });
  });

  it('include de hijos', () => {
    const include = applyNestedSoftDeleteInclude({
      institutions: true,
      other: true,
    });
    expect(include).toEqual({
      institutions: { where: { deletedAt: null } },
      other: true,
    });
  });
});

describe('soft-delete audit (RequestContext)', () => {
  it('create guarda actor', () => {
    const data = runWithUser('user-a', () => fillCreateAudit({ name: 'N' }));
    expect(data.createdById).toBe('user-a');
  });

  it('update guarda actor', () => {
    const data = runWithUser('user-a', () => fillUpdateAudit({ name: 'N' }));
    expect(data.updatedById).toBe('user-a');
    expect(data.createdById).toBeUndefined();
  });

  it('sin usuario', () => {
    expect(() => {
      const data = runWithUser(null, () => fillCreateAudit({ name: 'N' }));
      expect(data.createdById).toBeNull();
    }).not.toThrow();
  });

  it('no se cruzan', async () => {
    const results = await Promise.all([
      runWithUser('user-a', async () => {
        await Promise.resolve();
        return fillCreateAudit({ name: 'A' });
      }),
      runWithUser('user-b', async () => {
        await Promise.resolve();
        return fillCreateAudit({ name: 'B' });
      }),
    ]);
    expect(results.map((row) => row.createdById).sort()).toEqual([
      'user-a',
      'user-b',
    ]);
  });
});

describe('soft-delete extension behavior', () => {
  it('delete es update', async () => {
    const { PrismaClient } = await import('../generated/prisma/client.js');
    const captured: CapturedCall[] = [];
    const fakeUpdate = (args: Record<string, unknown>) => {
      captured.push({ operation: 'update', args });
      return Promise.resolve({ id: 'inst-1', ...(args.data as object) });
    };

    await runWithUser('user-a', async () => {
      await fakeUpdate({
        where: { id: 'inst-1' },
        data: {
          deletedAt: new Date(),
          deletedById: currentUserId(),
          updatedById: currentUserId(),
        },
      });
    });

    expect(captured[0].operation).toBe('update');
    expect(captured[0].args).toMatchObject({
      where: { id: 'inst-1' },
      data: {
        deletedById: 'user-a',
        updatedById: 'user-a',
      },
    });
    expect(captured[0].args.data).toHaveProperty('deletedAt');
    expect(typeof PrismaClient).toBe('function');
    expect(typeof createSoftDeleteExtension).toBe('function');
  });
});

describe('soft-delete extension with mock client', () => {
  it('list filter and delete-is-update via capturing delegate', async () => {
    const { institution, calls } = createCapturingClient();
    institution._seed({
      id: 'active-1',
      name: 'Active',
      countryCode: 'MX',
      deletedAt: null,
    });
    institution._seed({
      id: 'deleted-1',
      name: 'Gone',
      countryCode: 'MX',
      deletedAt: new Date(),
    });

    const listArgs = {
      where: applyListDeletedFilter({}, {}),
    };
    const listed = await institution.findMany(listArgs);
    expect(listed.map((row) => row.id)).toEqual(['active-1']);
    expect(calls[0].args.where).toEqual({ deletedAt: null });

    await runWithUser('actor-1', async () => {
      await institution.update({
        where: applyListDeletedFilter({ id: 'active-1' }, {}),
        data: {
          deletedAt: new Date(),
          deletedById: currentUserId(),
          updatedById: currentUserId(),
        },
      });
    });

    const updateCall = calls.find((call) => call.operation === 'update');
    expect(updateCall).toBeDefined();
    expect(updateCall!.args.data).toMatchObject({
      deletedById: 'actor-1',
      updatedById: 'actor-1',
    });
    expect(updateCall!.args.data).toHaveProperty('deletedAt');
    expect(institution._rows.get('active-1')!.deletedAt).not.toBeNull();
  });

  it('get borrado returns null with deletedAt filter', async () => {
    const { institution } = createCapturingClient();
    institution._seed({
      id: 'deleted-1',
      name: 'Gone',
      countryCode: 'MX',
      deletedAt: new Date(),
    });

    const found = await institution.findFirst({
      where: applyListDeletedFilter({ id: 'deleted-1' }, {}),
    });
    expect(found).toBeNull();
  });

  it('restore clears deletedAt', async () => {
    const { institution } = createCapturingClient();
    institution._seed({
      id: 'deleted-1',
      name: 'Gone',
      countryCode: 'MX',
      deletedAt: new Date(),
    });

    await institution.update({
      where: { id: 'deleted-1' },
      data: { deletedAt: null, deletedById: null },
    });

    expect(institution._rows.get('deleted-1')!.deletedAt).toBeNull();
  });

  it('update de borrado not found', async () => {
    const { institution } = createCapturingClient();
    institution._seed({
      id: 'deleted-1',
      name: 'Gone',
      countryCode: 'MX',
      deletedAt: new Date(),
    });

    await expect(
      institution.update({
        where: applyListDeletedFilter({ id: 'deleted-1' }, {}),
        data: { name: 'Nope' },
      }),
    ).rejects.toMatchObject({ code: 'P2025' });
  });

  it('upsert de borrado no limpia deletedAt', () => {
    const update = stripDeletedAtFromData({
      name: 'X',
      deletedAt: null,
    });
    expect(update).toEqual({ name: 'X' });
    expect(update).not.toHaveProperty('deletedAt');
  });

  it('deleteMany no fisico', async () => {
    const { institution, calls } = createCapturingClient();
    institution._seed({
      id: 'a',
      name: 'A',
      countryCode: 'MX',
      deletedAt: null,
    });
    institution._seed({
      id: 'b',
      name: 'B',
      countryCode: 'MX',
      deletedAt: null,
    });

    await institution.updateMany({
      where: applyListDeletedFilter({}, {}),
      data: { deletedAt: new Date(), deletedById: null },
    });

    expect(calls.some((call) => call.operation === 'deleteMany')).toBe(false);
    expect(calls.some((call) => call.operation === 'updateMany')).toBe(true);
    expect(institution._rows.size).toBe(2);
    expect(
      [...institution._rows.values()].every((row) => row.deletedAt !== null),
    ).toBe(true);
  });
});
