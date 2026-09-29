import { ConflictException, NotFoundException } from '@nestjs/common';
import { InstitutionsService } from './institutions.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

function createMockFn<Args extends unknown[] = unknown[], Result = unknown>() {
  let resolved: Result | undefined;
  let rejected: unknown;
  let impl: ((...args: Args) => Promise<Result>) | undefined;
  const calls: Args[] = [];
  const fn = ((...args: Args) => {
    calls.push(args);
    if (impl) {
      return impl(...args);
    }
    if (rejected !== undefined) {
      return Promise.reject(
        rejected instanceof Error ? rejected : new Error('mock rejection'),
      );
    }
    return Promise.resolve(resolved as Result);
  }) as ((...args: Args) => Promise<Result>) & {
    calls: Args[];
    mockResolvedValue: (value: Result) => void;
    mockRejectedValue: (error: unknown) => void;
    mockImplementation: (fn: (...args: Args) => Promise<Result>) => void;
  };
  fn.calls = calls;
  fn.mockResolvedValue = (value: Result) => {
    resolved = value;
    rejected = undefined;
    impl = undefined;
  };
  fn.mockRejectedValue = (error: unknown) => {
    rejected = error;
    impl = undefined;
  };
  fn.mockImplementation = (next: (...args: Args) => Promise<Result>) => {
    impl = next;
    rejected = undefined;
  };
  return fn;
}

type InstitutionRow = {
  id: string;
  name: string;
  countryCode: string;
  website: string | null;
  version: number;
  deletedAt: Date | null;
};

function sample(overrides: Partial<InstitutionRow> = {}): InstitutionRow {
  return {
    id: '01900000-0000-7000-8000-000000000001',
    name: 'Tec de Monterrey',
    countryCode: 'MX',
    website: 'https://tec.mx',
    version: 1,
    deletedAt: null,
    ...overrides,
  };
}

describe('InstitutionsService', () => {
  function setup() {
    const institution = {
      findMany: createMockFn(),
      count: createMockFn(),
      findFirst: createMockFn(),
      create: createMockFn(),
      updateMany: createMockFn(),
      delete: createMockFn(),
      restore: createMockFn(),
    };
    const incubator = {
      count: createMockFn(),
    };
    const baseInstitution = {
      delete: createMockFn(),
    };

    const prisma = {
      client: { institution, incubator },
      base: { institution: baseInstitution },
    } as unknown as PrismaService;

    const service = new InstitutionsService(prisma);
    return { service, institution, incubator, baseInstitution };
  }

  it('create valido', async () => {
    const { service, institution } = setup();
    const row = sample();
    institution.create.mockResolvedValue(row);
    const created = await service.create({
      name: row.name,
      countryCode: 'MX',
      website: row.website,
    });
    expect(created).toEqual(row);
    expect(institution.create.calls[0][0]).toMatchObject({
      data: {
        name: row.name,
        countryCode: 'MX',
        website: row.website,
      },
    });
  });

  it('list vacio', async () => {
    const { service, institution } = setup();
    institution.findMany.mockResolvedValue([]);
    institution.count.mockResolvedValue(0);
    const result = await service.list();
    expect(result).toEqual({ items: [], total: 0 });
  });

  it('list con q', async () => {
    const { service, institution } = setup();
    institution.findMany.mockResolvedValue([sample()]);
    institution.count.mockResolvedValue(1);
    await service.list({
      skip: 0,
      take: 20,
      orderBy: [{ createdAt: 'desc' }],
      where: {},
      q: 'tec',
    });
    const args = institution.findMany.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).toMatchObject({
      OR: [{ name: { contains: 'tec', mode: 'insensitive' } }],
    });
  });

  it('get 404', async () => {
    const { service, institution } = setup();
    institution.findFirst.mockResolvedValue(null);
    await expect(service.get('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update version ok', async () => {
    const { service, institution } = setup();
    institution.updateMany.mockResolvedValue({ count: 1 });
    const updated = sample({ version: 2, name: 'Nuevo' });
    institution.findFirst.mockResolvedValue(updated);
    const result = await service.update(updated.id, 1, { name: 'Nuevo' });
    expect(result.version).toBe(2);
    expect(institution.updateMany.calls[0][0]).toMatchObject({
      where: { id: updated.id, version: 1 },
      data: { name: 'Nuevo', version: { increment: 1 } },
    });
  });

  it('update version vieja', async () => {
    const { service, institution } = setup();
    institution.updateMany.mockResolvedValue({ count: 0 });
    institution.findFirst.mockResolvedValue(sample({ version: 3 }));
    await expect(
      service.update(sample().id, 2, { name: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('remove con incubadoras activas', async () => {
    const { service, institution, incubator } = setup();
    institution.findFirst.mockResolvedValue(sample());
    incubator.count.mockResolvedValue(2);
    await expect(service.remove(sample().id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(institution.delete.calls).toHaveLength(0);
  });

  it('remove ok', async () => {
    const { service, institution, incubator } = setup();
    const row = sample();
    institution.findFirst.mockResolvedValue(row);
    incubator.count.mockResolvedValue(0);
    institution.delete.mockResolvedValue({ ...row, deletedAt: new Date() });
    await service.remove(row.id);
    expect(institution.delete.calls).toHaveLength(1);
  });

  it('restore ya activo', async () => {
    const { service, institution } = setup();
    institution.findFirst.mockResolvedValue(sample({ deletedAt: null }));
    await expect(service.restore(sample().id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('restore unique ocupado', async () => {
    const { service, institution } = setup();
    const deleted = sample({ deletedAt: new Date() });
    institution.findFirst.mockImplementation((args: unknown) => {
      const where = (args as { where?: { NOT?: unknown } }).where;
      if (where && 'NOT' in (where ?? {})) {
        return Promise.resolve(sample({ id: 'other' }));
      }
      return Promise.resolve(deleted);
    });
    await expect(service.restore(deleted.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('restore ok', async () => {
    const { service, institution } = setup();
    const deleted = sample({ deletedAt: new Date() });
    let call = 0;
    institution.findFirst.mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return Promise.resolve(deleted);
      }
      return Promise.resolve(null);
    });
    institution.restore.mockResolvedValue({ ...deleted, deletedAt: null });
    const restored = await service.restore(deleted.id);
    expect(restored.deletedAt).toBeNull();
  });

  it('purge activo 409', async () => {
    const { service, institution, baseInstitution } = setup();
    institution.findFirst.mockResolvedValue(sample({ deletedAt: null }));
    await expect(service.purge(sample().id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(baseInstitution.delete.calls).toHaveLength(0);
  });

  it('purge soft-deleted', async () => {
    const { service, institution, baseInstitution } = setup();
    const deleted = sample({ deletedAt: new Date() });
    institution.findFirst.mockResolvedValue(deleted);
    baseInstitution.delete.mockResolvedValue(deleted);
    await service.purge(deleted.id);
    expect(baseInstitution.delete.calls[0][0]).toEqual({
      where: { id: deleted.id },
    });
  });

  it('listDeleted onlyDeleted flag', async () => {
    const { service, institution } = setup();
    institution.findMany.mockResolvedValue([]);
    institution.count.mockResolvedValue(0);
    await service.listDeleted();
    expect(institution.findMany.calls[0][0]).toMatchObject({
      onlyDeleted: true,
    });
  });
});
