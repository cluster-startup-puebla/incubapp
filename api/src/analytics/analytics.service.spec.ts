import { NotFoundException } from '@nestjs/common';
import { runWithRequestContext } from '../context/request-context.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AnalyticsService } from './analytics.service.js';

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

const INC_A = '01900000-0000-7000-8000-0000000000a1';
const INC_B = '01900000-0000-7000-8000-0000000000b2';

describe('AnalyticsService (T7.1)', () => {
  function setup() {
    const incubator = {
      count: createMockFn<[{ where?: unknown }], number>(),
    };
    const frameworkStage = {
      count: createMockFn<[{ where?: unknown }], number>(),
    };
    const startup = {
      count: createMockFn<[{ where?: unknown }], number>(),
    };
    const incubation = {
      groupBy: createMockFn<
        [{ by: string[]; where?: unknown; _count: unknown }],
        Array<{ status: string; _count: { _all: number } }>
      >(),
    };

    incubator.count.mockResolvedValue(2);
    frameworkStage.count.mockResolvedValue(5);
    startup.count.mockResolvedValue(3);
    incubation.groupBy.mockResolvedValue([
      { status: 'applied', _count: { _all: 4 } },
      { status: 'active', _count: { _all: 2 } },
      { status: 'graduated', _count: { _all: 1 } },
      { status: 'dropped', _count: { _all: 1 } },
    ]);

    const store = new Map<string, string>();
    const redis = {
      get: createMockFn<[string], string | null>(),
      setex: createMockFn<[string, number, string], 'OK'>(),
      incr: createMockFn<[string], number>(),
      disconnect: () => undefined,
    };
    redis.get.mockImplementation((key) =>
      Promise.resolve(store.get(key) ?? null),
    );
    redis.setex.mockImplementation((key, _ttl, value) => {
      store.set(key, value);
      return Promise.resolve('OK' as const);
    });
    redis.incr.mockImplementation((key) => {
      const next = Number(store.get(key) ?? '0') + 1;
      store.set(key, String(next));
      return Promise.resolve(next);
    });

    const prisma = {
      client: { incubator, frameworkStage, startup, incubation },
      base: {},
    } as unknown as PrismaService;

    const service = new AnalyticsService(prisma);
    (service as unknown as { redis: typeof redis; redisUrl: string }).redis =
      redis;
    (service as unknown as { redisUrl: string }).redisUrl =
      'redis://localhost:6379';

    return {
      service,
      incubator,
      frameworkStage,
      startup,
      incubation,
      redis,
      store,
    };
  }

  it('conteos cuadran con fixture', async () => {
    const { service } = setup();
    const result = await runWithRequestContext(
      {
        userId: 'admin',
        incubatorId: null,
        isSuperAdmin: true,
        actorId: 'admin',
      },
      () => service.overview({ roles: ['cluster_admin'] }),
    );

    expect(result).toEqual({
      incubators: 2,
      stages: 5,
      startups: 3,
      funnel: { applied: 4, active: 2, graduated: 1, dropped: 1 },
    });
  });

  it('excluye PRIVATE en where de startups', async () => {
    const { service, startup } = setup();
    await runWithRequestContext(
      {
        userId: 'admin',
        incubatorId: null,
        isSuperAdmin: true,
        actorId: 'admin',
      },
      () => service.overview({ roles: ['cluster_admin'] }),
    );

    const where = startup.count.calls[0]?.[0]?.where as {
      visibility?: { not?: string };
    };
    expect(where?.visibility?.not).toBe('PRIVATE');
  });

  it('director ve solo su incubadora', async () => {
    const { service, incubator, startup, incubation } = setup();
    await runWithRequestContext(
      {
        userId: 'dir',
        incubatorId: INC_A,
        isSuperAdmin: false,
        actorId: 'dir',
      },
      () => service.overview({ roles: ['director'] }),
    );

    expect((incubator.count.calls[0]?.[0]?.where as { id?: string }).id).toBe(
      INC_A,
    );
    expect(
      (startup.count.calls[0]?.[0]?.where as { incubatorId?: string })
        .incubatorId,
    ).toBe(INC_A);
    expect(
      (incubation.groupBy.calls[0]?.[0]?.where as { incubatorId?: string })
        .incubatorId,
    ).toBe(INC_A);
  });

  it('foreign scope → 404', () => {
    const { service } = setup();
    expect(() =>
      runWithRequestContext(
        {
          userId: 'dir',
          incubatorId: INC_A,
          isSuperAdmin: false,
          actorId: 'dir',
        },
        () => service.assertScopeAccess(INC_B),
      ),
    ).toThrow(NotFoundException);
  });

  it('cluster_admin sin header ve agregado', async () => {
    const { service, incubator } = setup();
    await runWithRequestContext(
      {
        userId: 'ca',
        incubatorId: null,
        isSuperAdmin: false,
        actorId: 'ca',
      },
      () => service.overview({ roles: ['cluster_admin'] }),
    );

    const where = incubator.count.calls[0]?.[0]?.where as { id?: string };
    expect(where?.id).toBeUndefined();
  });

  it('director sin scope → 404 (no 403)', async () => {
    const { service } = setup();
    await expect(
      runWithRequestContext(
        {
          userId: 'dir',
          incubatorId: null,
          isSuperAdmin: false,
          actorId: 'dir',
        },
        () => service.overview({ roles: ['director'] }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cache: segunda lectura no repite counts', async () => {
    const { service, incubator, frameworkStage, startup, incubation } = setup();

    await runWithRequestContext(
      {
        userId: 'admin',
        incubatorId: null,
        isSuperAdmin: true,
        actorId: 'admin',
      },
      async () => {
        await service.overview({ roles: ['cluster_admin'] });
        await service.overview({ roles: ['cluster_admin'] });
      },
    );

    expect(incubator.count.calls).toHaveLength(1);
    expect(frameworkStage.count.calls).toHaveLength(1);
    expect(startup.count.calls).toHaveLength(1);
    expect(incubation.groupBy.calls).toHaveLength(1);
  });

  it('write invalida cache y reconsulta', async () => {
    const { service, incubator } = setup();

    await runWithRequestContext(
      {
        userId: 'admin',
        incubatorId: null,
        isSuperAdmin: true,
        actorId: 'admin',
      },
      async () => {
        await service.overview({ roles: ['cluster_admin'] });
        await service.invalidateOverviewCache();
        await service.overview({ roles: ['cluster_admin'] });
      },
    );

    expect(incubator.count.calls).toHaveLength(2);
  });

  it('Redis throw → fail open con counts', async () => {
    const { service, redis, incubator } = setup();
    redis.get.mockRejectedValue(new Error('redis down'));
    redis.setex.mockRejectedValue(new Error('redis down'));

    const result = await runWithRequestContext(
      {
        userId: 'admin',
        incubatorId: null,
        isSuperAdmin: true,
        actorId: 'admin',
      },
      () => service.overview({ roles: ['cluster_admin'] }),
    );

    expect(result.incubators).toBe(2);
    expect(incubator.count.calls).toHaveLength(1);
  });
});
