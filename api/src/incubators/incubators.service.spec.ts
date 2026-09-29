import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { IncubatorsService, LOGO_MAX_BYTES } from './incubators.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { runWithRequestContext } from '../context/request-context.js';
import type { ObjectStorage } from '../storage/object-storage.js';

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

type IncubatorRow = {
  id: string;
  name: string;
  slug: string;
  latitude: number | null;
  longitude: number | null;
  brandPrimary: string | null;
  logoKey: string | null;
  institutionId: string | null;
  version: number;
  deletedAt: Date | null;
};

const SCOPE_A = '01900000-0000-7000-8000-0000000000aa';
const SCOPE_B = '01900000-0000-7000-8000-0000000000bb';

function sample(overrides: Partial<IncubatorRow> = {}): IncubatorRow {
  return {
    id: SCOPE_A,
    name: 'Incubadora Alpha',
    slug: 'alpha',
    latitude: 19.43,
    longitude: -99.13,
    brandPrimary: null,
    logoKey: null,
    institutionId: null,
    version: 1,
    deletedAt: null,
    ...overrides,
  };
}

describe('IncubatorsService', () => {
  function setup() {
    const incubator = {
      findMany: createMockFn(),
      count: createMockFn(),
      findFirst: createMockFn(),
      create: createMockFn(),
      updateMany: createMockFn(),
      delete: createMockFn(),
      restore: createMockFn(),
    };
    const incubation = {
      count: createMockFn(),
    };
    const institution = {
      findFirst: createMockFn(),
    };
    const baseIncubator = {
      delete: createMockFn(),
    };
    const baseIncubation = {
      deleteMany: createMockFn(),
    };

    const prisma = {
      client: { incubator, incubation, institution },
      base: { incubator: baseIncubator, incubation: baseIncubation },
    } as unknown as PrismaService;

    const frameworks = {
      assertPublishedFramework: () => Promise.resolve(),
    };

    const storage = {
      put: createMockFn<[Buffer, string], string>(),
      signedGet: createMockFn<
        [string, number?],
        { url: string; expiresIn: number }
      >(),
      delete: createMockFn<[string], void>(),
      configuredBucket: 'test',
    };

    const service = new IncubatorsService(
      prisma,
      frameworks as never,
      storage as unknown as ObjectStorage,
    );
    return {
      service,
      incubator,
      incubation,
      institution,
      baseIncubator,
      baseIncubation,
      frameworks,
      storage,
    };
  }

  it('create valido', async () => {
    const { service, incubator } = setup();
    const row = sample();
    incubator.create.mockResolvedValue(row);
    const created = await service.create({
      name: row.name,
      slug: row.slug,
      latitude: row.latitude,
      longitude: row.longitude,
    });
    expect(created.slug).toBe('alpha');
  });

  it('borrar con incubaciones activas 409', async () => {
    const { service, incubator, incubation } = setup();
    incubator.findFirst.mockResolvedValue(sample());
    incubation.count.mockResolvedValue(1);
    await expect(service.remove(SCOPE_A)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('borrar sin incubaciones activas', async () => {
    const { service, incubator, incubation } = setup();
    const row = sample();
    incubator.findFirst.mockResolvedValue(row);
    incubation.count.mockResolvedValue(0);
    incubator.delete.mockResolvedValue(row);
    await expect(service.remove(SCOPE_A)).resolves.toEqual(row);
  });

  it('director edita la suya 200', async () => {
    const { service, incubator } = setup();
    const row = sample({ version: 2, name: 'Updated' });
    incubator.updateMany.mockResolvedValue({ count: 1 });
    incubator.findFirst.mockResolvedValue(row);

    const updated = await runWithRequestContext(
      {
        userId: 'director-1',
        actorId: 'director-1',
        incubatorId: SCOPE_A,
        isSuperAdmin: false,
      },
      () => service.update(SCOPE_A, 1, { name: 'Updated' }),
    );
    expect(updated.name).toBe('Updated');
  });

  it('director edita otra 404', async () => {
    const { service } = setup();
    await expect(
      runWithRequestContext(
        {
          userId: 'director-1',
          actorId: 'director-1',
          incubatorId: SCOPE_A,
          isSuperAdmin: false,
        },
        () => service.update(SCOPE_B, 1, { name: 'Nope' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('mapa dos con coords una sin', async () => {
    const { service, incubator } = setup();
    incubator.findMany.mockResolvedValue([
      sample({ id: '1', latitude: 19, longitude: -99, slug: 'a' }),
      sample({ id: '2', latitude: 20, longitude: -100, slug: 'b' }),
      sample({ id: '3', latitude: null, longitude: null, slug: 'c' }),
    ]);

    const geo = await service.mapFeatures();
    expect(geo.type).toBe('FeatureCollection');
    expect(geo.features).toHaveLength(2);
    expect(geo.features[0].geometry.coordinates).toEqual([-99, 19]);
  });

  it('super admin edita cualquier', async () => {
    const { service, incubator } = setup();
    const row = sample({ id: SCOPE_B, version: 2 });
    incubator.updateMany.mockResolvedValue({ count: 1 });
    incubator.findFirst.mockResolvedValue(row);

    const updated = await runWithRequestContext(
      {
        userId: 'admin',
        actorId: 'admin',
        incubatorId: null,
        isSuperAdmin: true,
      },
      () => service.update(SCOPE_B, 1, { name: 'Admin Edit' }),
    );
    expect(updated.id).toBe(SCOPE_B);
  });

  it('update version conflict 409', async () => {
    const { service, incubator } = setup();
    incubator.updateMany.mockResolvedValue({ count: 0 });
    incubator.findFirst.mockResolvedValue(sample({ version: 3 }));
    await expect(
      service.update(SCOPE_A, 1, { name: 'stale' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('institution FK inexistente 404', async () => {
    const { service, institution } = setup();
    institution.findFirst.mockResolvedValue(null);
    await expect(
      service.create({
        name: 'X',
        slug: 'x',
        institutionId: '01900000-0000-7000-8000-000000000099',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('upload logo png', async () => {
    const { service, incubator, storage } = setup();
    const key = `incubators/${SCOPE_A}/logo`;
    const buffer = Buffer.alloc(200 * 1024, 1);
    incubator.findFirst.mockImplementation(() => {
      if (storage.put.calls.length > 0) {
        return Promise.resolve(sample({ logoKey: key, version: 2 }));
      }
      return Promise.resolve(sample({ logoKey: null, version: 1 }));
    });
    incubator.updateMany.mockResolvedValue({ count: 1 });
    storage.put.mockResolvedValue(key);
    storage.signedGet.mockResolvedValue({
      url: 'https://cdn.example/logo',
      expiresIn: 3600,
    });

    const result = await service.uploadLogo(SCOPE_A, 1, {
      buffer,
      mimetype: 'image/png',
      size: buffer.length,
    });

    expect(storage.put.calls).toHaveLength(1);
    expect(storage.put.calls[0][1]).toBe(key);
    expect(result.logoKey).toBe(key);
    expect(result.logoUrl).toBe('https://cdn.example/logo');
  });

  it('upload logo reemplazo borra llave vieja', async () => {
    const { service, incubator, storage } = setup();
    const oldKey = `incubators/${SCOPE_A}/logo`;
    const buffer = Buffer.from('png');
    incubator.findFirst.mockImplementation(() => {
      if (storage.put.calls.length > 0) {
        return Promise.resolve(sample({ logoKey: oldKey, version: 2 }));
      }
      return Promise.resolve(sample({ logoKey: oldKey, version: 1 }));
    });
    incubator.updateMany.mockResolvedValue({ count: 1 });
    storage.delete.mockResolvedValue(undefined);
    storage.put.mockResolvedValue(oldKey);
    storage.signedGet.mockResolvedValue({
      url: 'https://cdn.example/logo',
      expiresIn: 3600,
    });

    await service.uploadLogo(SCOPE_A, 1, {
      buffer,
      mimetype: 'image/png',
      size: buffer.length,
    });

    expect(storage.delete.calls).toHaveLength(1);
    expect(storage.delete.calls[0][0]).toBe(oldKey);
    expect(storage.put.calls).toHaveLength(1);
  });

  it('upload logo tipo invalido no llama storage', async () => {
    const { service, storage } = setup();
    await expect(
      service.uploadLogo(SCOPE_A, 1, {
        buffer: Buffer.from('<html>'),
        mimetype: 'text/html',
        size: 6,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.put.calls).toHaveLength(0);
    expect(storage.delete.calls).toHaveLength(0);
  });

  it('upload logo sobrepeso 400', async () => {
    const { service, storage } = setup();
    const size = LOGO_MAX_BYTES + 1;
    await expect(
      service.uploadLogo(SCOPE_A, 1, {
        buffer: Buffer.alloc(size),
        mimetype: 'image/png',
        size,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.put.calls).toHaveLength(0);
  });

  it('upload logo incubadora ajena 404 sin storage', async () => {
    const { service, storage } = setup();
    await expect(
      runWithRequestContext(
        {
          userId: 'director-1',
          actorId: 'director-1',
          incubatorId: SCOPE_A,
          isSuperAdmin: false,
        },
        () =>
          service.uploadLogo(SCOPE_B, 1, {
            buffer: Buffer.from('png'),
            mimetype: 'image/png',
            size: 3,
          }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.put.calls).toHaveLength(0);
    expect(storage.delete.calls).toHaveLength(0);
  });

  it('upload logo put falla no cambia fila', async () => {
    const { service, incubator, storage } = setup();
    incubator.findFirst.mockResolvedValue(
      sample({ logoKey: null, version: 1 }),
    );
    storage.put.mockRejectedValue(new Error('minio down'));

    await expect(
      service.uploadLogo(SCOPE_A, 1, {
        buffer: Buffer.from('png'),
        mimetype: 'image/png',
        size: 3,
      }),
    ).rejects.toThrow('minio down');
    expect(incubator.updateMany.calls).toHaveLength(0);
  });

  it('delete logo pone null y borra objeto', async () => {
    const { service, incubator, storage } = setup();
    const key = `incubators/${SCOPE_A}/logo`;
    incubator.findFirst.mockImplementation(() => {
      if (incubator.updateMany.calls.length > 0) {
        return Promise.resolve(sample({ logoKey: null, version: 2 }));
      }
      return Promise.resolve(sample({ logoKey: key, version: 1 }));
    });
    incubator.updateMany.mockResolvedValue({ count: 1 });
    storage.delete.mockResolvedValue(undefined);

    const result = await service.deleteLogo(SCOPE_A, 1);
    expect(incubator.updateMany.calls[0][0]).toMatchObject({
      where: { id: SCOPE_A, version: 1 },
      data: { logoKey: null },
    });
    expect(storage.delete.calls[0][0]).toBe(key);
    expect(result.logoKey).toBeNull();
    expect(result.logoUrl).toBeNull();
  });

  it('get sin logo no llama signedGet', async () => {
    const { service, incubator, storage } = setup();
    incubator.findFirst.mockResolvedValue(sample({ logoKey: null }));
    const result = await service.get(SCOPE_A);
    expect(result.logoUrl).toBeNull();
    expect(storage.signedGet.calls).toHaveLength(0);
  });
});
