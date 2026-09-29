import 'dotenv/config';
import {
  applyTenantFilter,
  forceTenantData,
  TENANT_MODELS,
} from './soft-delete.extension.js';
import { runWithRequestContext } from '../context/request-context.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe('tenant scoping helpers', () => {
  const INC_A = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';
  const INC_B = 'bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb';

  it('list del tenant', () => {
    runWithRequestContext(
      {
        userId: 'u1',
        incubatorId: INC_A,
        isSuperAdmin: false,
        actorId: 'u1',
      },
      () => {
        expect(applyTenantFilter('Startup', { name: 'X' })).toEqual({
          AND: [{ name: 'X' }, { incubatorId: INC_A }],
        });
      },
    );
  });

  it('create fuerza tenant', () => {
    runWithRequestContext(
      {
        userId: 'u1',
        incubatorId: INC_A,
        isSuperAdmin: false,
        actorId: 'u1',
      },
      () => {
        const data = forceTenantData('Startup', {
          name: 'S',
          incubatorId: INC_B,
        });
        expect(data.incubatorId).toBe(INC_A);
      },
    );
  });

  it('id de otro tenant', () => {
    runWithRequestContext(
      {
        userId: 'u1',
        incubatorId: INC_A,
        isSuperAdmin: false,
        actorId: 'u1',
      },
      () => {
        expect(applyTenantFilter('Startup', { id: 'startup-from-b' })).toEqual({
          AND: [{ id: 'startup-from-b' }, { incubatorId: INC_A }],
        });
      },
    );
  });

  it('TENANT_MODELS incluye Startup', () => {
    expect(TENANT_MODELS).toContain('Startup');
  });
});

(hasDatabase ? describe : describe.skip)('tenant scoping (integration)', () => {
  let prisma: Awaited<typeof import('./prisma.client.js')>['prisma'];
  let incAId: string;
  let incBId: string;

  beforeAll(async () => {
    ({ prisma } = await import('./prisma.client.js'));
    const suffix = `${Date.now()}`;
    const a = await prisma.incubator.create({
      data: { name: `Tenant A ${suffix}`, slug: `tenant-a-${suffix}` },
    });
    const b = await prisma.incubator.create({
      data: { name: `Tenant B ${suffix}`, slug: `tenant-b-${suffix}` },
    });
    incAId = a.id;
    incBId = b.id;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM startup_snapshot WHERE startup_id IN (SELECT id FROM startup WHERE incubator_id IN ('${incAId}', '${incBId}'))`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM startup WHERE incubator_id IN ('${incAId}', '${incBId}')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM incubator WHERE id IN ('${incAId}', '${incBId}')`,
    );
    await prisma.$disconnect();
  });

  it('create fuerza tenant contra body B', async () => {
    const created = await runWithRequestContext(
      {
        userId: 'tenant-actor',
        incubatorId: incAId,
        isSuperAdmin: false,
        actorId: 'tenant-actor',
      },
      async () =>
        prisma.startup.create({
          data: {
            name: `Forced ${Date.now()}`,
            domain: `forced-${Date.now()}.example`,
            incubatorId: incBId,
          },
        }),
    );
    expect(created.incubatorId).toBe(incAId);
  });

  it('findFirst id de B bajo A vacio', async () => {
    const inB = await runWithRequestContext(
      {
        userId: 'tenant-actor',
        incubatorId: incBId,
        isSuperAdmin: false,
        actorId: 'tenant-actor',
      },
      async () =>
        prisma.startup.create({
          data: {
            name: `Only B ${Date.now()}`,
            domain: `only-b-${Date.now()}.example`,
            incubatorId: incBId,
          },
        }),
    );

    const found = await runWithRequestContext(
      {
        userId: 'tenant-actor',
        incubatorId: incAId,
        isSuperAdmin: false,
        actorId: 'tenant-actor',
      },
      async () => prisma.startup.findFirst({ where: { id: inB.id } }),
    );
    expect(found).toBeNull();
  });
});
