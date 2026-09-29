import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { runWithRequestContext } from '../context/request-context.js';
import { encodeCursor } from '../common/query/pagination.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MetricReadingsService } from './metric-readings.service.js';

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

const STARTUP_ID = '01900000-0000-7000-8000-000000000001';
const METRIC_ID = '01900000-0000-7000-8000-000000000002';
const FRAMEWORK_ID = '01900000-0000-7000-8000-000000000003';
const READING_ID = '01900000-0000-7000-8000-000000000004';
const INCUBATOR_ID = '01900000-0000-7000-8000-000000000010';

type ReadingRow = {
  id: string;
  startupId: string;
  metricDefId: string;
  period: Date;
  value: number;
  verifiedAt: Date | null;
  verifiedById: string | null;
  version: number;
  createdAt: Date;
  deletedAt: Date | null;
};

function sampleReading(overrides: Partial<ReadingRow> = {}): ReadingRow {
  return {
    id: READING_ID,
    startupId: STARTUP_ID,
    metricDefId: METRIC_ID,
    period: new Date('2026-01-15T00:00:00.000Z'),
    value: 10,
    verifiedAt: null,
    verifiedById: null,
    version: 1,
    createdAt: new Date('2026-01-16T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('MetricReadingsService', () => {
  function setup() {
    const startup = {
      findFirst: createMockFn(),
    };
    const metricDef = {
      findFirst: createMockFn(),
    };
    const metricReading = {
      findMany: createMockFn(),
      findFirst: createMockFn(),
      create: createMockFn(),
      updateMany: createMockFn(),
    };

    const prisma = {
      client: { startup, metricDef, metricReading },
      base: {},
    } as unknown as PrismaService;

    const service = new MetricReadingsService(prisma);
    return { service, startup, metricDef, metricReading };
  }

  function asUser<T>(fn: () => T): T {
    return runWithRequestContext(
      {
        userId: 'actor-1',
        actorId: 'actor-1',
        incubatorId: INCUBATOR_ID,
        isSuperAdmin: false,
      },
      fn,
    );
  }

  beforeEach(() => {
    // fixed "today" for future-period tests relies on system clock;
    // period strings compare lexicographically as YYYY-MM-DD.
  });

  it('upsert same key updates value on one row', async () => {
    const { service, startup, metricDef, metricReading } = setup();
    startup.findFirst.mockResolvedValue({
      id: STARTUP_ID,
      incubatorId: INCUBATOR_ID,
      incubator: { frameworkId: FRAMEWORK_ID },
    });
    metricDef.findFirst.mockResolvedValue({
      id: METRIC_ID,
      frameworkId: FRAMEWORK_ID,
      allowNegative: false,
    });
    const existing = sampleReading({ value: 10 });
    metricReading.updateMany.mockResolvedValue({ count: 1 });
    let findCalls = 0;
    metricReading.findFirst.mockImplementation(() => {
      findCalls += 1;
      if (findCalls === 1) {
        return Promise.resolve(existing);
      }
      return Promise.resolve(sampleReading({ value: 42, version: 2 }));
    });

    const result = await asUser(() =>
      service.upsert(STARTUP_ID, {
        metricDefId: METRIC_ID,
        period: '2026-01-15',
        value: 42,
      }),
    );

    expect(result.created).toBe(false);
    expect(result.row.value).toBe(42);
    expect(metricReading.create.calls).toHaveLength(0);
    expect(metricReading.updateMany.calls).toHaveLength(1);
    const updateArgs = metricReading.updateMany.calls[0]?.[0] as {
      data: { value: number; verifiedAt: null; verifiedById: null };
    };
    expect(updateArgs.data.value).toBe(42);
    expect(updateArgs.data.verifiedAt).toBeNull();
    expect(updateArgs.data.verifiedById).toBeNull();
  });

  it('negativo con allowNegative false → 400', async () => {
    const { service, startup, metricDef } = setup();
    startup.findFirst.mockResolvedValue({
      id: STARTUP_ID,
      incubatorId: INCUBATOR_ID,
      incubator: { frameworkId: FRAMEWORK_ID },
    });
    metricDef.findFirst.mockResolvedValue({
      id: METRIC_ID,
      frameworkId: FRAMEWORK_ID,
      allowNegative: false,
    });

    await expect(
      asUser(() =>
        service.upsert(STARTUP_ID, {
          metricDefId: METRIC_ID,
          period: '2026-01-15',
          value: -1,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('periodo futuro → 400', async () => {
    const { service } = setup();
    const future = '2099-12-31';

    await expect(
      asUser(() =>
        service.upsert(STARTUP_ID, {
          metricDefId: METRIC_ID,
          period: future,
          value: 1,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('edit tras verifiedAt limpia verificacion', async () => {
    const { service, startup, metricDef, metricReading } = setup();
    startup.findFirst.mockResolvedValue({
      id: STARTUP_ID,
      incubatorId: INCUBATOR_ID,
      incubator: { frameworkId: FRAMEWORK_ID },
    });
    metricDef.findFirst.mockResolvedValue({
      id: METRIC_ID,
      frameworkId: FRAMEWORK_ID,
      allowNegative: true,
    });

    const existing = sampleReading({
      value: 5,
      verifiedAt: new Date('2026-01-20T00:00:00.000Z'),
      verifiedById: 'staff-1',
    });

    let findCalls = 0;
    metricReading.findFirst.mockImplementation(() => {
      findCalls += 1;
      if (findCalls === 1) {
        return Promise.resolve(existing);
      }
      return Promise.resolve(
        sampleReading({
          value: 9,
          version: 2,
          verifiedAt: null,
          verifiedById: null,
        }),
      );
    });
    metricReading.updateMany.mockResolvedValue({ count: 1 });

    const result = await asUser(() =>
      service.upsert(STARTUP_ID, {
        metricDefId: METRIC_ID,
        period: '2026-01-15',
        value: 9,
      }),
    );

    expect(result.row.verifiedAt).toBeNull();
    expect(result.row.verifiedById).toBeNull();
    const updateArgs = metricReading.updateMany.calls[0]?.[0] as {
      data: { verifiedAt: null; verifiedById: null };
    };
    expect(updateArgs.data.verifiedAt).toBeNull();
    expect(updateArgs.data.verifiedById).toBeNull();
  });

  it('founder verifica → 403', async () => {
    const { service } = setup();

    await expect(
      asUser(() =>
        service.verify(STARTUP_ID, READING_ID, {
          roles: ['founder'],
          isSuperAdmin: false,
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('director verifica → ok', async () => {
    const { service, startup, metricReading } = setup();
    startup.findFirst.mockResolvedValue({
      id: STARTUP_ID,
      incubatorId: INCUBATOR_ID,
      incubator: { frameworkId: FRAMEWORK_ID },
    });
    const existing = sampleReading();
    let findCalls = 0;
    metricReading.findFirst.mockImplementation(() => {
      findCalls += 1;
      if (findCalls === 1) {
        return Promise.resolve(existing);
      }
      return Promise.resolve(
        sampleReading({
          verifiedAt: new Date('2026-01-21T00:00:00.000Z'),
          verifiedById: 'actor-1',
          version: 2,
        }),
      );
    });
    metricReading.updateMany.mockResolvedValue({ count: 1 });

    const row = await asUser(() =>
      service.verify(STARTUP_ID, READING_ID, {
        roles: ['director'],
        isSuperAdmin: false,
      }),
    );

    expect(row.verifiedById).toBe('actor-1');
    expect(row.verifiedAt).toBeInstanceOf(Date);
  });

  it('lista cursor sin total', async () => {
    const { service, startup, metricReading } = setup();
    startup.findFirst.mockResolvedValue({
      id: STARTUP_ID,
      incubatorId: INCUBATOR_ID,
      incubator: { frameworkId: FRAMEWORK_ID },
    });
    const items = [
      sampleReading({ id: 'a', createdAt: new Date('2026-01-03') }),
      sampleReading({ id: 'b', createdAt: new Date('2026-01-02') }),
    ];
    metricReading.findMany.mockResolvedValue(items);

    const result = await asUser(() =>
      service.list({
        startupId: STARTUP_ID,
        take: 2,
        cursor: encodeCursor({
          id: 'z',
          createdAt: new Date('2026-01-04').toISOString(),
        }),
      }),
    );

    expect(result.items).toHaveLength(2);
    expect(result).not.toHaveProperty('total');
    expect(metricReading.findMany.calls[0]?.[0]).toMatchObject({
      take: 2,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('startup ausente → 404', async () => {
    const { service, startup } = setup();
    startup.findFirst.mockResolvedValue(null);

    await expect(
      asUser(() => service.get(STARTUP_ID, READING_ID)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
