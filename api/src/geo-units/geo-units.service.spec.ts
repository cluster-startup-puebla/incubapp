import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GeoUnitsService } from './geo-units.service.js';
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

type GeoUnitRow = {
  id: string;
  level: 'COUNTRY' | 'STATE' | 'MUNICIPALITY';
  code: string;
  name: string;
  parentId: string | null;
  version: number;
  deletedAt: Date | null;
};

const COUNTRY_ID = '01900000-0000-7000-8000-000000000001';
const STATE_ID = '01900000-0000-7000-8000-000000000002';

function sample(overrides: Partial<GeoUnitRow> = {}): GeoUnitRow {
  return {
    id: COUNTRY_ID,
    level: 'COUNTRY',
    code: 'MX',
    name: 'México',
    parentId: null,
    version: 1,
    deletedAt: null,
    ...overrides,
  };
}

describe('GeoUnitsService', () => {
  function setup() {
    const geoUnit = {
      findMany: createMockFn(),
      count: createMockFn(),
      findFirst: createMockFn(),
      create: createMockFn(),
      updateMany: createMockFn(),
      delete: createMockFn(),
      restore: createMockFn(),
    };
    const baseGeoUnit = {
      delete: createMockFn(),
    };

    const prisma = {
      client: { geoUnit },
      base: { geoUnit: baseGeoUnit },
    } as unknown as PrismaService;

    const service = new GeoUnitsService(prisma);
    return { service, geoUnit, baseGeoUnit };
  }

  it('create country', async () => {
    const { service, geoUnit } = setup();
    const row = sample();
    geoUnit.create.mockResolvedValue(row);
    const created = await service.create({
      level: 'COUNTRY',
      code: 'MX',
      name: 'México',
    });
    expect(created).toEqual(row);
    expect(geoUnit.create.calls[0][0]).toMatchObject({
      data: {
        level: 'COUNTRY',
        code: 'MX',
        name: 'México',
        parentId: null,
      },
    });
  });

  it('list children of country returns states', async () => {
    const { service, geoUnit } = setup();
    const country = sample();
    const states = [
      sample({
        id: STATE_ID,
        level: 'STATE',
        code: 'PUE',
        name: 'Puebla',
        parentId: COUNTRY_ID,
      }),
      sample({
        id: '01900000-0000-7000-8000-000000000004',
        level: 'STATE',
        code: 'JAL',
        name: 'Jalisco',
        parentId: COUNTRY_ID,
      }),
    ];
    geoUnit.findFirst.mockResolvedValue(country);
    geoUnit.findMany.mockResolvedValue(states);
    geoUnit.count.mockResolvedValue(2);

    const result = await service.listChildren(COUNTRY_ID);
    expect(result.items).toEqual(states);
    expect(result.total).toBe(2);
    expect(geoUnit.findMany.calls[0][0]).toMatchObject({
      where: { parentId: COUNTRY_ID },
    });
  });

  it('municipality under country is 422', async () => {
    const { service, geoUnit } = setup();
    geoUnit.findFirst.mockResolvedValue(sample());
    await expect(
      service.create({
        level: 'MUNICIPALITY',
        code: 'BAD',
        name: 'Bad',
        parentId: COUNTRY_ID,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(geoUnit.create.calls).toHaveLength(0);
  });

  it('cycle parent self is 422', async () => {
    const { service, geoUnit } = setup();
    const state = sample({
      id: STATE_ID,
      level: 'STATE',
      code: 'PUE',
      name: 'Puebla',
      parentId: COUNTRY_ID,
    });
    geoUnit.findFirst.mockResolvedValue(state);
    await expect(
      service.update(STATE_ID, 1, { parentId: STATE_ID }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('cycle parent descendant is 422', async () => {
    const { service, geoUnit } = setup();
    const country = sample();
    const state = sample({
      id: STATE_ID,
      level: 'STATE',
      code: 'PUE',
      name: 'Puebla',
      parentId: COUNTRY_ID,
    });

    geoUnit.findFirst.mockImplementation((args: unknown) => {
      const where = (args as { where?: { id?: string }; select?: unknown })
        .where;
      const id = where?.id;
      if (id === COUNTRY_ID) {
        return Promise.resolve(
          (args as { select?: unknown }).select ? { parentId: null } : country,
        );
      }
      if (id === STATE_ID) {
        return Promise.resolve(
          (args as { select?: unknown }).select
            ? { parentId: COUNTRY_ID }
            : state,
        );
      }
      return Promise.resolve(null);
    });

    await expect(
      service.update(COUNTRY_ID, 1, { parentId: STATE_ID }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('get not found', async () => {
    const { service, geoUnit } = setup();
    geoUnit.findFirst.mockResolvedValue(null);
    await expect(service.get(COUNTRY_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('remove with children 409', async () => {
    const { service, geoUnit } = setup();
    geoUnit.findFirst.mockResolvedValue(sample());
    geoUnit.count.mockResolvedValue(2);
    await expect(service.remove(COUNTRY_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('purge active 409', async () => {
    const { service, geoUnit } = setup();
    geoUnit.findFirst.mockResolvedValue(sample({ deletedAt: null }));
    await expect(service.purge(COUNTRY_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
