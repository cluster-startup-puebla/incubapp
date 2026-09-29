import 'dotenv/config';
import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { runWithRequestContext } from '../context/request-context.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  createIncubationSchema,
  updateIncubationSchema,
} from './incubation.dto.js';
import { IncubationsService } from './incubations.service.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe('T6.10 incubations domain extras', () => {
  it('rechaza id / deletedAt / createdById / incubatorId', () => {
    expect(
      createIncubationSchema.safeParse({
        status: 'applied',
        id: '01900000-0000-7000-8000-000000000099',
      }).success,
    ).toBe(false);
    expect(
      createIncubationSchema.safeParse({
        status: 'applied',
        deletedAt: new Date().toISOString(),
      }).success,
    ).toBe(false);
    expect(
      createIncubationSchema.safeParse({
        status: 'applied',
        createdById: 'actor-1',
      }).success,
    ).toBe(false);
    expect(
      createIncubationSchema.safeParse({
        status: 'applied',
        incubatorId: '01900000-0000-7000-8000-000000000099',
      }).success,
    ).toBe(false);
  });

  it('fechas endedOn < startedOn → 400 (zod)', () => {
    const parsed = createIncubationSchema.safeParse({
      startedOn: '2026-06-01',
      endedOn: '2026-05-01',
    });
    expect(parsed.success).toBe(false);
  });

  it('update vacio falla', () => {
    expect(updateIncubationSchema.safeParse({}).success).toBe(false);
  });
});

(hasDatabase ? describe : describe.skip)(
  'T6.10 incubations domain (integration)',
  () => {
    let prisma: Awaited<typeof import('../prisma/prisma.client.js')>['prisma'];
    let base: Awaited<
      typeof import('../prisma/prisma.client.js')
    >['baseClient'];
    let service: IncubationsService;
    const suffix = `${Date.now()}`;
    let incubatorId: string;

    beforeAll(async () => {
      const mod = await import('../prisma/prisma.client.js');
      prisma = mod.prisma;
      base = mod.baseClient;
      service = new IncubationsService({
        client: prisma,
        base,
      } as unknown as PrismaService);

      const incubator = await prisma.incubator.create({
        data: {
          name: `T610 Inc ${suffix}`,
          slug: `t610-inc-${suffix}`,
        },
      });
      incubatorId = incubator.id;
    });

    afterAll(async () => {
      await base.$executeRawUnsafe(
        `DELETE FROM incubation WHERE incubator_id = '${incubatorId}'`,
      );
      await base.$executeRawUnsafe(
        `DELETE FROM incubator WHERE id = '${incubatorId}'`,
      );
      await prisma.$disconnect();
    });

    beforeEach(async () => {
      await base.$executeRawUnsafe(
        `DELETE FROM incubation WHERE incubator_id = '${incubatorId}'`,
      );
    });

    function asDirector<T>(fn: () => T): T {
      return runWithRequestContext(
        {
          userId: 't610-director',
          actorId: 't610-director',
          incubatorId,
          isSuperAdmin: false,
        },
        fn,
      );
    }

    it('transicion valida applied → active → 200', async () => {
      const created = await asDirector(() => service.create({}));
      expect(created.status).toBe('applied');

      const updated = await asDirector(() =>
        service.update(created.id, created.version, { status: 'active' }),
      );
      expect(updated.status).toBe('active');
      expect(updated.version).toBe(created.version + 1);
    });

    it('transicion invalida graduated → active → 409', async () => {
      const created = await asDirector(() => service.create({}));
      const active = await asDirector(() =>
        service.update(created.id, created.version, { status: 'active' }),
      );
      const graduated = await asDirector(() =>
        service.update(active.id, active.version, { status: 'graduated' }),
      );

      await expect(
        asDirector(() =>
          service.update(graduated.id, graduated.version, {
            status: 'active',
          }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('dos activas en la misma incubadora → 409', async () => {
      const first = await asDirector(() => service.create({}));
      await asDirector(() =>
        service.update(first.id, first.version, { status: 'active' }),
      );

      const second = await asDirector(() => service.create({}));
      await expect(
        asDirector(() =>
          service.update(second.id, second.version, { status: 'active' }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('fechas endedOn < startedOn → 400', async () => {
      const created = await asDirector(() => service.create({}));
      await expect(
        asDirector(() =>
          service.update(created.id, created.version, {
            startedOn: new Date('2026-06-01'),
            endedOn: new Date('2026-05-01'),
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('a dropped sin exit reason → 422', async () => {
      const created = await asDirector(() => service.create({}));
      const active = await asDirector(() =>
        service.update(created.id, created.version, { status: 'active' }),
      );
      await expect(
        asDirector(() =>
          service.update(active.id, active.version, { status: 'dropped' }),
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('dropped con exit reason → 200', async () => {
      const created = await asDirector(() => service.create({}));
      const active = await asDirector(() =>
        service.update(created.id, created.version, { status: 'active' }),
      );
      const dropped = await asDirector(() =>
        service.update(active.id, active.version, {
          status: 'dropped',
          exitReason: 'Left the program',
        }),
      );
      expect(dropped.status).toBe('dropped');
      expect(dropped.exitReason).toBe('Left the program');
    });
  },
);
