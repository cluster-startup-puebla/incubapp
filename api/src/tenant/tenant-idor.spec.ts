import 'dotenv/config';
import { NotFoundException } from '@nestjs/common';
import { TENANT_MODELS } from '../prisma/soft-delete.extension.js';
import {
  GLOBAL_RESOURCES,
  HTTP_RESOURCES,
  TENANT_RESOURCES,
} from './tenant-resources.js';
import { runWithRequestContext } from '../context/request-context.js';
import { StartupsService } from '../startups/startups.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe('TENANT_RESOURCES registry', () => {
  it('recurso nuevo: TENANT_MODELS ⊆ TENANT_RESOURCES', () => {
    const registered = new Set(TENANT_RESOURCES.map((r) => r.model));
    for (const model of TENANT_MODELS) {
      expect(registered.has(model)).toBe(true);
    }
  });

  it('cada recurso declara GET/PATCH/DELETE', () => {
    for (const resource of TENANT_RESOURCES) {
      expect(resource.methods).toEqual(
        expect.arrayContaining(['GET', 'PATCH', 'DELETE']),
      );
    }
  });

  it('institution es global permission-based (no TENANT_MODEL)', () => {
    expect(TENANT_MODELS).not.toContain('Institution');
    const institution = GLOBAL_RESOURCES.find((r) => r.model === 'Institution');
    expect(institution).toBeDefined();
    expect(institution?.idor).toBe('permission');
    expect(HTTP_RESOURCES.some((r) => r.model === 'Institution')).toBe(true);
  });
});

(hasDatabase ? describe : describe.skip)(
  'anti-IDOR suite (integration)',
  () => {
    let prisma: Awaited<typeof import('../prisma/prisma.client.js')>['prisma'];
    let startups: StartupsService;
    let incAId: string;
    let incBId: string;
    let startupBId: string;

    beforeAll(async () => {
      ({ prisma } = await import('../prisma/prisma.client.js'));
      startups = new StartupsService({
        client: prisma,
      } as unknown as PrismaService);

      const suffix = `${Date.now()}`;
      const incA = await prisma.incubator.create({
        data: { name: `Inc A ${suffix}`, slug: `inc-a-${suffix}` },
      });
      const incB = await prisma.incubator.create({
        data: { name: `Inc B ${suffix}`, slug: `inc-b-${suffix}` },
      });
      incAId = incA.id;
      incBId = incB.id;

      const createdB = await runWithRequestContext(
        {
          userId: 'idor-actor',
          incubatorId: incBId,
          isSuperAdmin: false,
          actorId: 'idor-actor',
        },
        async () =>
          prisma.startup.create({
            data: {
              name: `Startup B ${suffix}`,
              incubatorId: incBId,
            },
          }),
      );
      startupBId = createdB.id;

      await runWithRequestContext(
        {
          userId: 'idor-actor',
          incubatorId: incAId,
          isSuperAdmin: false,
          actorId: 'idor-actor',
        },
        async () =>
          prisma.startup.create({
            data: {
              name: `Startup A ${suffix}`,
              incubatorId: incAId,
            },
          }),
      );
    });

    afterAll(async () => {
      await prisma.$executeRawUnsafe(
        `DELETE FROM startup WHERE incubator_id IN ('${incAId}', '${incBId}')`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM incubator WHERE id IN ('${incAId}', '${incBId}')`,
      );
      await prisma.$disconnect();
    });

    it.each([...TENANT_RESOURCES])(
      'GET cross-tenant $model not found',
      async () => {
        await expect(
          runWithRequestContext(
            {
              userId: 'idor-actor',
              incubatorId: incAId,
              isSuperAdmin: false,
              actorId: 'idor-actor',
            },
            async () => startups.get(startupBId),
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
      },
    );

    it.each([...TENANT_RESOURCES])(
      'PATCH cross-tenant $model not found',
      async () => {
        await expect(
          runWithRequestContext(
            {
              userId: 'idor-actor',
              incubatorId: incAId,
              isSuperAdmin: false,
              actorId: 'idor-actor',
            },
            async () => startups.update(startupBId, { name: 'hacked' }),
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
      },
    );

    it.each([...TENANT_RESOURCES])(
      'DELETE cross-tenant $model not found',
      async () => {
        await expect(
          runWithRequestContext(
            {
              userId: 'idor-actor',
              incubatorId: incAId,
              isSuperAdmin: false,
              actorId: 'idor-actor',
            },
            async () => startups.remove(startupBId),
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
      },
    );

    it('list no mezcla', async () => {
      const listA = await runWithRequestContext(
        {
          userId: 'idor-actor',
          incubatorId: incAId,
          isSuperAdmin: false,
          actorId: 'idor-actor',
        },
        async () => startups.list(),
      );
      expect(listA.items.map((row) => row.id)).not.toContain(startupBId);
      expect(listA.items.every((row) => row.incubatorId === incAId)).toBe(true);
    });
  },
);
