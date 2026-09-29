import 'dotenv/config';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { runWithRequestContext } from '../context/request-context.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { createStartupSchema } from './startup.dto.js';
import { StartupsService } from './startups.service.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe('T6.6 startups domain extras', () => {
  it('rechaza id / deletedAt / incubatorId', () => {
    expect(
      createStartupSchema.safeParse({
        name: 'Acme',
        domain: 'acme.com',
        incubatorId: '01900000-0000-7000-8000-000000000099',
      }).success,
    ).toBe(false);
    expect(
      createStartupSchema.safeParse({
        name: 'Acme',
        domain: 'acme.com',
        id: '01900000-0000-7000-8000-000000000099',
      }).success,
    ).toBe(false);
  });

  it('requiere domain', () => {
    expect(createStartupSchema.safeParse({ name: 'Acme' }).success).toBe(false);
  });
});

(hasDatabase ? describe : describe.skip)(
  'T6.6 startups domain (integration)',
  () => {
    let prisma: Awaited<typeof import('../prisma/prisma.client.js')>['prisma'];
    let base: Awaited<
      typeof import('../prisma/prisma.client.js')
    >['baseClient'];
    let service: StartupsService;
    const suffix = `${Date.now()}`;
    let incAId: string;
    let incBId: string;

    beforeAll(async () => {
      const mod = await import('../prisma/prisma.client.js');
      prisma = mod.prisma;
      base = mod.baseClient;
      service = new StartupsService({
        client: prisma,
        base,
      } as unknown as PrismaService);

      const incA = await prisma.incubator.create({
        data: { name: `T66 A ${suffix}`, slug: `t66-a-${suffix}` },
      });
      const incB = await prisma.incubator.create({
        data: { name: `T66 B ${suffix}`, slug: `t66-b-${suffix}` },
      });
      incAId = incA.id;
      incBId = incB.id;
    });

    afterAll(async () => {
      await base.$executeRawUnsafe(
        `DELETE FROM startup_snapshot WHERE startup_id IN (SELECT id FROM startup WHERE incubator_id IN ('${incAId}', '${incBId}'))`,
      );
      await base.$executeRawUnsafe(
        `DELETE FROM startup WHERE incubator_id IN ('${incAId}', '${incBId}')`,
      );
      await base.$executeRawUnsafe(
        `DELETE FROM incubator WHERE id IN ('${incAId}', '${incBId}')`,
      );
      await prisma.$disconnect();
    });

    function asFounderA<T>(fn: () => T): T {
      return runWithRequestContext(
        {
          userId: 't66-founder-a',
          actorId: 't66-founder-a',
          incubatorId: incAId,
          isSuperAdmin: false,
        },
        fn,
      );
    }

    function asFounderB<T>(fn: () => T): T {
      return runWithRequestContext(
        {
          userId: 't66-founder-b',
          actorId: 't66-founder-b',
          incubatorId: incBId,
          isSuperAdmin: false,
        },
        fn,
      );
    }

    function asAdminA<T>(fn: () => T): T {
      return runWithRequestContext(
        {
          userId: 't66-admin',
          actorId: 't66-admin',
          incubatorId: incAId,
          isSuperAdmin: true,
        },
        fn,
      );
    }

    it('alta crea snapshot vigente', async () => {
      const domain = `unique-${suffix}.example`;
      const created = await asFounderA(() =>
        service.create({ name: `Unique ${suffix}`, domain }),
      );
      expect(created.ownerUserId).toBe('t66-founder-a');
      expect(created.visibility).toBe('INCUBATOR');

      const snap = await prisma.startupSnapshot.findFirst({
        where: { startupId: created.id, validTo: null },
      });
      expect(snap).not.toBeNull();
      expect(snap?.name).toBe(created.name);
      expect(snap?.domain).toBe(domain);
    });

    it('parecido dominio 409', async () => {
      const domain = `collide-${suffix}.example`;
      await asFounderA(() =>
        service.create({ name: `First ${suffix}`, domain }),
      );
      await expect(
        asFounderA(() => service.create({ name: `Second ${suffix}`, domain })),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('force admin 201', async () => {
      const domain = `force-admin-${suffix}.example`;
      await asFounderA(() =>
        service.create({ name: `Base ${suffix}`, domain }),
      );
      const forced = await asAdminA(() =>
        service.create(
          { name: `Forced ${suffix}`, domain },
          { force: true, isSuperAdmin: true },
        ),
      );
      expect(forced.name).toBe(`Forced ${suffix}`);
    });

    it('force founder 403 y no crea', async () => {
      const domain = `force-founder-${suffix}.example`;
      const before = await prisma.startup.count({
        where: { domain },
      });
      await expect(
        asFounderA(() =>
          service.create(
            { name: `Blocked ${suffix}`, domain },
            { force: true, isSuperAdmin: false },
          ),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const after = await prisma.startup.count({ where: { domain } });
      expect(after).toBe(before);
    });

    it('founder edita la suya', async () => {
      const created = await asFounderA(() =>
        service.create({
          name: `Mine ${suffix}`,
          domain: `mine-${suffix}.example`,
        }),
      );
      const updated = await asFounderA(() =>
        service.update(
          created.id,
          created.version,
          { name: `Mine Renamed ${suffix}` },
          { roles: ['founder'] },
        ),
      );
      expect(updated.name).toBe(`Mine Renamed ${suffix}`);
      expect(updated.version).toBe(created.version + 1);
    });

    it('founder edita otra 404', async () => {
      const other = await asFounderA(() =>
        service.create({
          name: `Other Owner ${suffix}`,
          domain: `other-owner-${suffix}.example`,
        }),
      );
      await expect(
        runWithRequestContext(
          {
            userId: 't66-founder-other',
            actorId: 't66-founder-other',
            incubatorId: incAId,
            isSuperAdmin: false,
          },
          () =>
            service.update(
              other.id,
              other.version,
              { name: 'Hacked' },
              { roles: ['founder'] },
            ),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('visibilidad private otro tenant 404 y ausente en list', async () => {
      const privateRow = await asFounderA(() =>
        service.create({
          name: `Private ${suffix}`,
          domain: `private-${suffix}.example`,
          visibility: 'PRIVATE',
        }),
      );

      await expect(
        asFounderB(() => service.get(privateRow.id)),
      ).rejects.toBeInstanceOf(NotFoundException);

      const listB = await asFounderB(() => service.list());
      expect(listB.items.map((row) => row.id)).not.toContain(privateRow.id);

      const stillVisible = await asFounderA(() => service.get(privateRow.id));
      expect(stillVisible.id).toBe(privateRow.id);
    });
  },
);
