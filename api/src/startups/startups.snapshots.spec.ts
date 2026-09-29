import 'dotenv/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
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
const STARTUP_ID = '01900000-0000-7000-8000-0000000000a1';
const SNAP_ID = '01900000-0000-7000-8000-0000000000b1';

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

type SnapshotRow = {
  id: string;
  startupId: string;
  name: string;
  domain: string;
  validFrom: Date;
  validTo: Date | null;
};

function sampleStartup(overrides: Partial<StartupRow> = {}): StartupRow {
  return {
    id: STARTUP_ID,
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

function sampleSnap(overrides: Partial<SnapshotRow> = {}): SnapshotRow {
  return {
    id: SNAP_ID,
    startupId: STARTUP_ID,
    name: 'Acme',
    domain: 'acme.com',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validTo: null,
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

describe('T6.7 StartupsService snapshots (unit)', () => {
  it('rollback: segundo insert falla — no deja vigente cerrado ni huérfano', async () => {
    const row = sampleStartup();
    const open = sampleSnap();
    const store: SnapshotRow[] = [{ ...open }];
    let committed = false;

    const startup = {
      findFirst: createMockFn(),
      updateMany: createMockFn(),
      update: createMockFn(),
    };
    startup.findFirst.mockResolvedValue(row);
    startup.updateMany.mockResolvedValue({ count: 1 });

    const startupSnapshot = {
      findFirst: createMockFn(),
      update: createMockFn(),
      create: createMockFn(),
    };
    startupSnapshot.findFirst.mockImplementation(() => {
      return Promise.resolve(store.find((s) => s.validTo === null) ?? null);
    });
    startupSnapshot.update.mockImplementation(
      (args: { where: { id: string }; data: { validTo: Date } }) => {
        const idx = store.findIndex((s) => s.id === args.where.id);
        if (idx < 0) return Promise.reject(new Error('missing snap'));
        store[idx] = { ...store[idx], validTo: args.data.validTo };
        return Promise.resolve(store[idx]);
      },
    );
    startupSnapshot.create.mockRejectedValue(new Error('second write failed'));

    const transaction = createMockFn();
    transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const snapshotBefore = store.map((s) => ({ ...s }));
        try {
          const result = await fn({ startup, startupSnapshot });
          committed = true;
          return result;
        } catch (error) {
          store.length = 0;
          store.push(...snapshotBefore);
          committed = false;
          throw error;
        }
      },
    );

    const prisma = {
      client: {
        startup,
        startupSnapshot,
        $transaction: transaction,
      },
      base: { startup: { delete: createMockFn() } },
    } as unknown as PrismaService;

    const service = new StartupsService(prisma);

    await expect(
      asFounder(() =>
        service.update(
          row.id,
          1,
          { name: 'Acme Renamed' },
          {
            roles: ['founder'],
          },
        ),
      ),
    ).rejects.toThrow(/second write failed/);

    expect(committed).toBe(false);
    expect(store).toHaveLength(1);
    expect(store[0].validTo).toBeNull();
    expect(store[0].name).toBe('Acme');
  });

  it('pasado: PATCH de snapshot con validTo → 409', async () => {
    const closed = sampleSnap({
      validTo: new Date('2026-02-01T00:00:00.000Z'),
    });
    const row = sampleStartup();

    const startup = {
      findFirst: createMockFn(),
    };
    startup.findFirst.mockResolvedValue(row);

    const startupSnapshot = {
      findFirst: createMockFn(),
      update: createMockFn(),
    };
    startupSnapshot.findFirst.mockResolvedValue(closed);

    const prisma = {
      client: {
        startup,
        startupSnapshot,
        $transaction: createMockFn(),
      },
      base: { startup: { delete: createMockFn() } },
    } as unknown as PrismaService;

    const service = new StartupsService(prisma);

    await expect(
      asFounder(() =>
        service.updateSnapshot(
          closed.id,
          { name: 'Nope' },
          { roles: ['founder'] },
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(startupSnapshot.update.calls).toHaveLength(0);
  });
});

const hasDatabase = Boolean(process.env.DATABASE_URL);

(hasDatabase ? describe : describe.skip)(
  'T6.7 startups snapshots (integration)',
  () => {
    let prisma: Awaited<typeof import('../prisma/prisma.client.js')>['prisma'];
    let base: Awaited<
      typeof import('../prisma/prisma.client.js')
    >['baseClient'];
    let service: StartupsService;
    const suffix = `${Date.now()}`;
    let incId: string;

    beforeAll(async () => {
      const mod = await import('../prisma/prisma.client.js');
      prisma = mod.prisma;
      base = mod.baseClient;
      service = new StartupsService({
        client: prisma,
        base,
      } as unknown as PrismaService);

      const inc = await prisma.incubator.create({
        data: { name: `T67 ${suffix}`, slug: `t67-${suffix}` },
      });
      incId = inc.id;
    });

    afterAll(async () => {
      await base.$executeRawUnsafe(
        `DELETE FROM startup_snapshot WHERE startup_id IN (SELECT id FROM startup WHERE incubator_id = '${incId}')`,
      );
      await base.$executeRawUnsafe(
        `DELETE FROM startup WHERE incubator_id = '${incId}'`,
      );
      await base.$executeRawUnsafe(
        `DELETE FROM incubator WHERE id = '${incId}'`,
      );
      await prisma.$disconnect();
    });

    function asFounderA<T>(fn: () => T): T {
      return runWithRequestContext(
        {
          userId: 't67-founder',
          actorId: 't67-founder',
          incubatorId: incId,
          isSuperAdmin: false,
        },
        fn,
      );
    }

    it('cierra y abre: rename cierra vigente y abre otro; v1 queda en cerrado', async () => {
      const created = await asFounderA(() =>
        service.create({
          name: `V1 ${suffix}`,
          domain: `v1-${suffix}.example`,
        }),
      );

      const renamed = await asFounderA(() =>
        service.update(
          created.id,
          created.version,
          { name: `V2 ${suffix}` },
          { roles: ['founder'] },
        ),
      );
      expect(renamed.name).toBe(`V2 ${suffix}`);

      const snaps = await prisma.startupSnapshot.findMany({
        where: { startupId: created.id },
        orderBy: { validFrom: 'asc' },
      });
      expect(snaps).toHaveLength(2);
      expect(snaps[0].name).toBe(`V1 ${suffix}`);
      expect(snaps[0].validTo).not.toBeNull();
      expect(snaps[1].name).toBe(`V2 ${suffix}`);
      expect(snaps[1].validTo).toBeNull();
      expect(snaps[0].validTo?.getTime()).toBe(snaps[1].validFrom.getTime());
    });

    it('dos cambios: tres snapshots contiguos', async () => {
      let row = await asFounderA(() =>
        service.create({
          name: `A ${suffix}`,
          domain: `two-${suffix}.example`,
        }),
      );
      row = await asFounderA(() =>
        service.update(
          row.id,
          row.version,
          { name: `B ${suffix}` },
          { roles: ['founder'] },
        ),
      );
      row = await asFounderA(() =>
        service.update(
          row.id,
          row.version,
          { name: `C ${suffix}` },
          { roles: ['founder'] },
        ),
      );
      expect(row.name).toBe(`C ${suffix}`);

      const snaps = await prisma.startupSnapshot.findMany({
        where: { startupId: row.id },
        orderBy: { validFrom: 'asc' },
      });
      expect(snaps).toHaveLength(3);
      expect(snaps.map((s) => s.name)).toEqual([
        `A ${suffix}`,
        `B ${suffix}`,
        `C ${suffix}`,
      ]);
      expect(snaps[0].validTo?.getTime()).toBe(snaps[1].validFrom.getTime());
      expect(snaps[1].validTo?.getTime()).toBe(snaps[2].validFrom.getTime());
      expect(snaps[2].validTo).toBeNull();
    });

    it('solape: constraint EXCLUDE rechaza rangos que se pisan', async () => {
      const created = await asFounderA(() =>
        service.create({
          name: `Overlap ${suffix}`,
          domain: `overlap-${suffix}.example`,
        }),
      );
      const current = await prisma.startupSnapshot.findFirst({
        where: { startupId: created.id, validTo: null },
      });
      expect(current).not.toBeNull();

      const from = new Date(current!.validFrom.getTime() - 60_000);
      const to = new Date(current!.validFrom.getTime() + 60_000);

      await expect(
        base.startupSnapshot.create({
          data: {
            startupId: created.id,
            name: 'Overlap',
            domain: current!.domain,
            validFrom: from,
            validTo: to,
          },
        }),
      ).rejects.toThrow();
    });

    it('pasado: PATCH de snapshot cerrado → 409', async () => {
      const created = await asFounderA(() =>
        service.create({
          name: `Closed ${suffix}`,
          domain: `closed-${suffix}.example`,
        }),
      );
      await asFounderA(() =>
        service.update(
          created.id,
          created.version,
          { name: `Closed Open ${suffix}` },
          { roles: ['founder'] },
        ),
      );

      const closed = await prisma.startupSnapshot.findFirst({
        where: { startupId: created.id, validTo: { not: null } },
      });
      expect(closed).not.toBeNull();

      await expect(
        asFounderA(() =>
          service.updateSnapshot(
            closed!.id,
            { name: 'Nope' },
            { roles: ['founder'] },
          ),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  },
);

describe('T6.7 snapshot dto / getSnapshot', () => {
  it('getSnapshot 404 si no existe', async () => {
    const startupSnapshot = {
      findFirst: createMockFn(),
    };
    startupSnapshot.findFirst.mockResolvedValue(null);
    const prisma = {
      client: {
        startup: { findFirst: createMockFn() },
        startupSnapshot,
        $transaction: createMockFn(),
      },
      base: { startup: { delete: createMockFn() } },
    } as unknown as PrismaService;
    const service = new StartupsService(prisma);
    await expect(
      asFounder(() =>
        service.getSnapshot('01900000-0000-7000-8000-000000000099'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
