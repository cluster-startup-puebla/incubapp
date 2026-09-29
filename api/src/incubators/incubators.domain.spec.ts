import 'dotenv/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  runWithRequestContext,
  runWithUser,
} from '../context/request-context.js';
import { IncubatorsService } from './incubators.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  createIncubatorSchema,
  updateIncubatorSchema,
} from './incubator.dto.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe('T6.3 incubators domain extras', () => {
  it('lat 120 invalida', () => {
    const parsed = createIncubatorSchema.safeParse({
      name: 'Bad Lat',
      slug: 'bad-lat',
      latitude: 120,
      longitude: 0,
    });
    expect(parsed.success).toBe(false);
  });

  it('lng fuera de rango', () => {
    const parsed = createIncubatorSchema.safeParse({
      name: 'Bad Lng',
      slug: 'bad-lng',
      latitude: 0,
      longitude: 181,
    });
    expect(parsed.success).toBe(false);
  });

  it('coords validas', () => {
    const parsed = createIncubatorSchema.safeParse({
      name: 'Ok',
      slug: 'ok-coords',
      latitude: -90,
      longitude: 180,
    });
    expect(parsed.success).toBe(true);
  });

  it('mass assignment rechaza incubatorId', () => {
    const parsed = createIncubatorSchema.safeParse({
      name: 'X',
      slug: 'x',
      incubatorId: '01900000-0000-7000-8000-000000000001',
    });
    expect(parsed.success).toBe(false);
  });

  it('update vacio 400', () => {
    const parsed = updateIncubatorSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });
});

(hasDatabase ? describe : describe.skip)(
  'T6.3 incubators domain (integration)',
  () => {
    let prisma: Awaited<typeof import('../prisma/prisma.client.js')>['prisma'];
    let base: Awaited<
      typeof import('../prisma/prisma.client.js')
    >['baseClient'];
    let service: IncubatorsService;
    const suffix = `${Date.now()}`;

    beforeAll(async () => {
      const mod = await import('../prisma/prisma.client.js');
      prisma = mod.prisma;
      base = mod.baseClient;
      service = new IncubatorsService({
        client: prisma,
        base,
      } as unknown as PrismaService);
    });

    afterAll(async () => {
      await base.$executeRawUnsafe(
        `DELETE FROM incubation WHERE incubator_id IN (SELECT id FROM incubator WHERE slug LIKE '%${suffix.replace(/'/g, "''")}%')`,
      );
      await base.$executeRawUnsafe(
        `DELETE FROM incubator WHERE slug LIKE '%${suffix.replace(/'/g, "''")}%'`,
      );
      await prisma.$disconnect();
    });

    it('slug reutilizable tras delete', async () => {
      const slug = `reuse-${suffix}`;
      const first = await runWithUser('t63-actor', async () =>
        service.create({ name: `First ${suffix}`, slug }),
      );
      await runWithUser('t63-actor', async () => service.remove(first.id));
      const second = await runWithUser('t63-actor', async () =>
        service.create({ name: `Second ${suffix}`, slug }),
      );
      expect(second.id).not.toBe(first.id);
      expect(second.slug).toBe(slug);
    });

    it('slug activo duplicado', async () => {
      const slug = `dup-${suffix}`;
      await runWithUser('t63-actor', async () =>
        service.create({ name: `Dup A ${suffix}`, slug }),
      );
      await expect(
        runWithUser('t63-actor', async () =>
          service.create({ name: `Dup B ${suffix}`, slug }),
        ),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('borrar con incubaciones activas', async () => {
      const created = await runWithUser('t63-actor', async () =>
        service.create({
          name: `With Inc ${suffix}`,
          slug: `with-inc-${suffix}`,
        }),
      );
      await prisma.incubation.create({
        data: { incubatorId: created.id, status: 'active' },
      });
      await expect(
        runWithUser('t63-actor', async () => service.remove(created.id)),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('director edita la suya', async () => {
      const created = await runWithUser('t63-actor', async () =>
        service.create({
          name: `Mine ${suffix}`,
          slug: `mine-${suffix}`,
        }),
      );
      const updated = await runWithRequestContext(
        {
          userId: 'director-1',
          actorId: 'director-1',
          incubatorId: created.id,
          isSuperAdmin: false,
        },
        () => service.update(created.id, 1, { name: `Mine 2 ${suffix}` }),
      );
      expect(updated.version).toBe(2);
      expect(updated.name).toBe(`Mine 2 ${suffix}`);
    });

    it('director edita otra 404', async () => {
      const mine = await runWithUser('t63-actor', async () =>
        service.create({
          name: `Scope Mine ${suffix}`,
          slug: `scope-mine-${suffix}`,
        }),
      );
      const other = await runWithUser('t63-actor', async () =>
        service.create({
          name: `Scope Other ${suffix}`,
          slug: `scope-other-${suffix}`,
        }),
      );
      await expect(
        runWithRequestContext(
          {
            userId: 'director-1',
            actorId: 'director-1',
            incubatorId: mine.id,
            isSuperAdmin: false,
          },
          () => service.update(other.id, 1, { name: 'hack' }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('mapa FeatureCollection', async () => {
      await runWithUser('t63-actor', async () =>
        service.create({
          name: `Map A ${suffix}`,
          slug: `map-a-${suffix}`,
          latitude: 19.4,
          longitude: -99.1,
        }),
      );
      await runWithUser('t63-actor', async () =>
        service.create({
          name: `Map B ${suffix}`,
          slug: `map-b-${suffix}`,
          latitude: 20.6,
          longitude: -100.4,
        }),
      );
      await runWithUser('t63-actor', async () =>
        service.create({
          name: `Map C ${suffix}`,
          slug: `map-c-${suffix}`,
        }),
      );

      const geo = await runWithUser('t63-actor', async () =>
        service.mapFeatures(),
      );
      const ours = geo.features.filter((f) =>
        f.properties.slug.includes(suffix),
      );
      expect(ours).toHaveLength(2);
      expect(geo.type).toBe('FeatureCollection');
    });
  },
);
