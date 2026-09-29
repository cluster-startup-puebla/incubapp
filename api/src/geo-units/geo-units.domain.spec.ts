import 'dotenv/config';
import { UnprocessableEntityException } from '@nestjs/common';
import { runWithUser } from '../context/request-context.js';
import { GeoUnitsService } from './geo-units.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { createGeoUnitSchema } from './geo-unit.dto.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe('T6.1 geo-units domain extras', () => {
  it('create schema rejects empty code', () => {
    const parsed = createGeoUnitSchema.safeParse({
      level: 'COUNTRY',
      code: '  ',
      name: 'X',
    });
    expect(parsed.success).toBe(false);
  });

  it('create schema accepts country', () => {
    const parsed = createGeoUnitSchema.safeParse({
      level: 'COUNTRY',
      code: 'MX',
      name: 'México',
    });
    expect(parsed.success).toBe(true);
  });
});

(hasDatabase ? describe : describe.skip)(
  'T6.1 geo-units domain (integration)',
  () => {
    let prisma: Awaited<typeof import('../prisma/prisma.client.js')>['prisma'];
    let base: Awaited<
      typeof import('../prisma/prisma.client.js')
    >['baseClient'];
    let service: GeoUnitsService;
    const suffix = `${Date.now()}`;
    const createdIds: string[] = [];

    beforeAll(async () => {
      const mod = await import('../prisma/prisma.client.js');
      prisma = mod.prisma;
      base = mod.baseClient;
      service = new GeoUnitsService({
        client: prisma,
        base,
      } as unknown as PrismaService);
    });

    afterAll(async () => {
      for (const id of createdIds.reverse()) {
        await base.$executeRawUnsafe(`DELETE FROM geo_unit WHERE id = '${id}'`);
      }
      await prisma.$disconnect();
    });

    it('hijos de pais son estados', async () => {
      const country = await prisma.geoUnit.findFirst({
        where: { level: 'COUNTRY', code: 'MX' },
      });
      expect(country).toBeTruthy();
      const { items } = await service.listChildren(country!.id, {
        skip: 0,
        take: 50,
        orderBy: [{ code: 'asc' }],
      });
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items.every((row) => row.level === 'STATE')).toBe(true);
      expect(items.every((row) => row.parentId === country!.id)).toBe(true);
    });

    it('nivel imposible municipio bajo pais', async () => {
      const country = await prisma.geoUnit.findFirst({
        where: { level: 'COUNTRY', code: 'MX' },
      });
      expect(country).toBeTruthy();
      await expect(
        runWithUser('t61-actor', async () =>
          service.create({
            level: 'MUNICIPALITY',
            code: `T61-BAD-${suffix}`,
            name: `Bad Muni ${suffix}`,
            parentId: country!.id,
          }),
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('ciclo parent self', async () => {
      const country = await runWithUser('t61-actor', async () =>
        service.create({
          level: 'COUNTRY',
          code: `T61-C-${suffix}`,
          name: `Cycle Country ${suffix}`,
        }),
      );
      createdIds.push(country.id);
      await expect(
        runWithUser('t61-actor', async () =>
          service.update(country.id, country.version, {
            parentId: country.id,
          }),
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('ciclo parent descendant', async () => {
      const country = await runWithUser('t61-actor', async () =>
        service.create({
          level: 'COUNTRY',
          code: `T61-CD-${suffix}`,
          name: `Cycle Desc ${suffix}`,
        }),
      );
      createdIds.push(country.id);
      const state = await runWithUser('t61-actor', async () =>
        service.create({
          level: 'STATE',
          code: `T61-S-${suffix}`,
          name: `Cycle State ${suffix}`,
          parentId: country.id,
        }),
      );
      createdIds.push(state.id);

      await expect(
        runWithUser('t61-actor', async () =>
          service.update(country.id, country.version, {
            parentId: state.id,
          }),
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('recrear code tras soft delete', async () => {
      const code = `T61-R-${suffix}`;
      const first = await runWithUser('t61-actor', async () =>
        service.create({
          level: 'COUNTRY',
          code,
          name: `Recreate ${suffix}`,
        }),
      );
      createdIds.push(first.id);
      await runWithUser('t61-actor', async () => service.remove(first.id));
      const second = await runWithUser('t61-actor', async () =>
        service.create({
          level: 'COUNTRY',
          code,
          name: `Recreate 2 ${suffix}`,
        }),
      );
      createdIds.push(second.id);
      expect(second.id).not.toBe(first.id);
    });
  },
);
