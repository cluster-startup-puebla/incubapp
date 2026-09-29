import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { runWithRequestContext } from '../context/request-context.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { StartupsService } from './startups.service.js';

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

const INC_A = '01900000-0000-7000-8000-0000000000i1';

type StartupRow = {
  id: string;
  name: string;
  domain: string;
  visibility: 'PRIVATE' | 'INCUBATOR' | 'CLUSTER' | 'PUBLIC';
  incubatorId: string;
  ownerUserId: string | null;
  version: number;
  deletedAt: Date | null;
};

function sample(overrides: Partial<StartupRow> = {}): StartupRow {
  return {
    id: '01900000-0000-7000-8000-0000000000a1',
    name: 'Acme',
    domain: 'acme.com',
    visibility: 'INCUBATOR',
    incubatorId: INC_A,
    ownerUserId: 'founder-1',
    version: 1,
    deletedAt: null,
    ...overrides,
  };
}

function asFounder<T>(fn: () => T): T {
  return runWithRequestContext(
    {
      userId: 'founder-1',
      actorId: 'founder-1',
      incubatorId: INC_A,
      isSuperAdmin: false,
    },
    fn,
  );
}

describe('StartupsService', () => {
  function setup() {
    const startup = {
      findMany: createMockFn(),
      count: createMockFn(),
      findFirst: createMockFn(),
      create: createMockFn(),
      updateMany: createMockFn(),
      delete: createMockFn(),
      restore: createMockFn(),
    };
    const startupSnapshot = {
      create: createMockFn(),
      findFirst: createMockFn(),
      update: createMockFn(),
    };
    const baseStartup = {
      delete: createMockFn(),
    };
    const transaction = createMockFn();
    transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ startup, startupSnapshot }),
    );

    const prisma = {
      client: {
        startup,
        startupSnapshot,
        $transaction: transaction,
      },
      base: { startup: baseStartup },
    } as unknown as PrismaService;

    const service = new StartupsService(prisma);
    return { service, startup, startupSnapshot, baseStartup, transaction };
  }

  it('create valido con snapshot vigente', async () => {
    const { service, startup, startupSnapshot } = setup();
    const row = sample();
    startup.findMany.mockResolvedValue([]);
    startup.create.mockResolvedValue(row);
    startupSnapshot.create.mockResolvedValue({
      id: 'snap-1',
      startupId: row.id,
      name: row.name,
      domain: row.domain,
      validTo: null,
    });

    const created = await asFounder(() =>
      service.create({ name: row.name, domain: row.domain }),
    );

    expect(created).toEqual(row);
    expect(startupSnapshot.create.calls).toHaveLength(1);
    const snapData = startupSnapshot.create.calls[0][0] as {
      data: { validTo: Date | null; startupId: string };
    };
    expect(snapData.data.validTo).toBeNull();
    expect(snapData.data.startupId).toBe(row.id);
  });

  it('mismo dominio 409 con candidates', async () => {
    const { service, startup } = setup();
    const existing = sample();
    startup.findMany.mockResolvedValue([existing]);

    await expect(
      asFounder(() =>
        service.create({ name: 'Other', domain: existing.domain }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    try {
      await asFounder(() =>
        service.create({ name: 'Other', domain: existing.domain }),
      );
    } catch (error) {
      const response = (error as ConflictException).getResponse() as {
        candidates: Array<{ id: string; domain: string }>;
      };
      expect(response.candidates[0]).toMatchObject({
        id: existing.id,
        domain: existing.domain,
      });
    }
  });

  it('force admin 201', async () => {
    const { service, startup, startupSnapshot } = setup();
    const row = sample({ name: 'Forced' });
    startup.findMany.mockResolvedValue([sample()]);
    startup.create.mockResolvedValue(row);
    startupSnapshot.create.mockResolvedValue({});

    const created = await runWithRequestContext(
      {
        userId: 'admin',
        actorId: 'admin',
        incubatorId: INC_A,
        isSuperAdmin: true,
      },
      () =>
        service.create(
          { name: 'Forced', domain: row.domain },
          { force: true, isSuperAdmin: true },
        ),
    );
    expect(created.name).toBe('Forced');
    expect(startup.create.calls).toHaveLength(1);
  });

  it('force founder 403 sin crear', async () => {
    const { service, startup } = setup();
    await expect(
      asFounder(() =>
        service.create(
          { name: 'Nope', domain: 'nope.com' },
          { force: true, isSuperAdmin: false },
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(startup.create.calls).toHaveLength(0);
  });

  it('founder edita la suya 200', async () => {
    const { service, startup, startupSnapshot } = setup();
    const row = sample();
    startup.updateMany.mockResolvedValue({ count: 1 });
    startupSnapshot.findFirst.mockResolvedValue({
      id: 'snap-1',
      startupId: row.id,
      name: row.name,
      domain: row.domain,
      validTo: null,
    });
    startupSnapshot.update.mockResolvedValue({});
    startupSnapshot.create.mockResolvedValue({});
    let calls = 0;
    startup.findFirst.mockImplementation(() => {
      calls += 1;
      if (calls === 1) return Promise.resolve(row);
      return Promise.resolve({ ...row, name: 'Acme 2', version: 2 });
    });

    const updated = await asFounder(() =>
      service.update(row.id, 1, { name: 'Acme 2' }, { roles: ['founder'] }),
    );
    expect(updated.name).toBe('Acme 2');
    expect(startupSnapshot.update.calls).toHaveLength(1);
    expect(startupSnapshot.create.calls).toHaveLength(1);
  });

  it('founder edita otra 404', async () => {
    const { service, startup } = setup();
    const row = sample({ ownerUserId: 'other-founder' });
    startup.findFirst.mockResolvedValue(row);

    await expect(
      asFounder(() =>
        service.update(row.id, 1, { name: 'Hack' }, { roles: ['founder'] }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(startup.updateMany.calls).toHaveLength(0);
  });

  it('visibilidad private otro tenant filtrada en query', async () => {
    const { service, startup } = setup();
    startup.findMany.mockResolvedValue([]);
    startup.count.mockResolvedValue(0);

    await asFounder(() =>
      service.list({
        skip: 0,
        take: 20,
        orderBy: [{ createdAt: 'desc' }],
        where: {},
      }),
    );

    const where = startup.findMany.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(JSON.stringify(where.where)).toContain('PRIVATE');
    expect(JSON.stringify(where.where)).toContain('OR');
  });
});
