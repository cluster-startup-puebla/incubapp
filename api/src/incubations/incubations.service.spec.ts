import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { runWithRequestContext } from '../context/request-context.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { IncubationsService } from './incubations.service.js';

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

type IncubationRow = {
  id: string;
  incubatorId: string;
  status: string;
  startedOn: Date | null;
  endedOn: Date | null;
  exitReason: string | null;
  version: number;
  deletedAt: Date | null;
};

const INCUBATOR_ID = '01900000-0000-7000-8000-000000000010';

function sample(overrides: Partial<IncubationRow> = {}): IncubationRow {
  return {
    id: '01900000-0000-7000-8000-000000000001',
    incubatorId: INCUBATOR_ID,
    status: 'applied',
    startedOn: null,
    endedOn: null,
    exitReason: null,
    version: 1,
    deletedAt: null,
    ...overrides,
  };
}

describe('IncubationsService', () => {
  function setup() {
    const incubation = {
      findMany: createMockFn(),
      count: createMockFn(),
      findFirst: createMockFn(),
      create: createMockFn(),
      updateMany: createMockFn(),
      delete: createMockFn(),
      restore: createMockFn(),
    };
    const baseIncubation = {
      delete: createMockFn(),
    };

    const prisma = {
      client: { incubation },
      base: { incubation: baseIncubation },
    } as unknown as PrismaService;

    const service = new IncubationsService(prisma);
    return { service, incubation, baseIncubation };
  }

  function asScoped<T>(fn: () => T): T {
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

  it('create applied por defecto', async () => {
    const { service, incubation } = setup();
    const row = sample();
    incubation.create.mockResolvedValue(row);
    const created = await asScoped(() => service.create({}));
    expect(created.status).toBe('applied');
    expect(incubation.create.calls[0][0]).toMatchObject({
      data: { incubatorId: INCUBATOR_ID, status: 'applied' },
    });
  });

  it('create sin incubator context → 400', async () => {
    const { service } = setup();
    await expect(
      runWithRequestContext(
        {
          userId: 'actor-1',
          actorId: 'actor-1',
          incubatorId: null,
          isSuperAdmin: false,
        },
        () => service.create({}),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transicion applied → active', async () => {
    const { service, incubation } = setup();
    const row = sample();
    const updated = sample({ status: 'active', version: 2 });
    let findPass = 0;
    incubation.findFirst.mockImplementation((args: unknown) => {
      const where = (args as { where?: Record<string, unknown> }).where ?? {};
      if (where.status === 'active') {
        return Promise.resolve(null);
      }
      findPass += 1;
      return Promise.resolve(findPass === 1 ? row : updated);
    });
    incubation.updateMany.mockResolvedValue({ count: 1 });

    const result = await asScoped(() =>
      service.update(row.id, 1, { status: 'active' }),
    );
    expect(result.status).toBe('active');
  });

  it('transicion graduated → active → 409', async () => {
    const { service, incubation } = setup();
    incubation.findFirst.mockResolvedValue(
      sample({ status: 'graduated', version: 3 }),
    );
    await expect(
      asScoped(() => service.update(sample().id, 3, { status: 'active' })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('segunda activa → 409', async () => {
    const { service, incubation } = setup();
    const current = sample({ id: '01900000-0000-7000-8000-000000000002' });
    incubation.findFirst.mockImplementation((args: unknown) => {
      const where = (args as { where?: { status?: string } }).where;
      if (where?.status === 'active') {
        return Promise.resolve(
          sample({ id: '01900000-0000-7000-8000-000000000099' }),
        );
      }
      return Promise.resolve(current);
    });
    await expect(
      asScoped(() => service.update(current.id, 1, { status: 'active' })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('endedOn < startedOn → 400', async () => {
    const { service, incubation } = setup();
    incubation.findFirst.mockResolvedValue(sample());
    await expect(
      asScoped(() =>
        service.update(sample().id, 1, {
          startedOn: new Date('2026-06-01'),
          endedOn: new Date('2026-05-01'),
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('dropped sin exitReason → 422', async () => {
    const { service, incubation } = setup();
    incubation.findFirst.mockResolvedValue(sample({ status: 'active' }));
    await expect(
      asScoped(() => service.update(sample().id, 1, { status: 'dropped' })),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('get 404', async () => {
    const { service, incubation } = setup();
    incubation.findFirst.mockResolvedValue(null);
    await expect(
      asScoped(() => service.get(sample().id)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('purge de activo → 409', async () => {
    const { service, incubation } = setup();
    incubation.findFirst.mockResolvedValue(sample());
    await expect(
      asScoped(() => service.purge(sample().id)),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
