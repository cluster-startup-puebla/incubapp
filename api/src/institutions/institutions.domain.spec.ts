import 'dotenv/config';
import { ConflictException } from '@nestjs/common';
import { runWithUser } from '../context/request-context.js';
import { InstitutionsService } from './institutions.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { createInstitutionSchema } from './institution.dto.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe('T6.2 institutions domain extras', () => {
  it('url invalida', () => {
    const parsed = createInstitutionSchema.safeParse({
      name: 'Tec',
      countryCode: 'MX',
      website: 'notaurl',
    });
    expect(parsed.success).toBe(false);
  });

  it('url valida', () => {
    const parsed = createInstitutionSchema.safeParse({
      name: 'Tec',
      countryCode: 'MX',
      website: 'https://tec.mx',
    });
    expect(parsed.success).toBe(true);
  });
});

(hasDatabase ? describe : describe.skip)(
  'T6.2 institutions domain (integration)',
  () => {
    let prisma: Awaited<typeof import('../prisma/prisma.client.js')>['prisma'];
    let base: Awaited<
      typeof import('../prisma/prisma.client.js')
    >['baseClient'];
    let service: InstitutionsService;
    const suffix = `${Date.now()}`;

    beforeAll(async () => {
      const mod = await import('../prisma/prisma.client.js');
      prisma = mod.prisma;
      base = mod.baseClient;
      service = new InstitutionsService({
        client: prisma,
        base,
      } as unknown as PrismaService);
    });

    afterAll(async () => {
      await base.$executeRawUnsafe(
        `DELETE FROM incubator WHERE name LIKE '%${suffix.replace(/'/g, "''")}%'`,
      );
      await base.$executeRawUnsafe(
        `DELETE FROM institution WHERE name LIKE '%${suffix.replace(/'/g, "''")}%'`,
      );
      await prisma.$disconnect();
    });

    it('nombre unico por pais', async () => {
      const name = `Unique MX ${suffix}`;
      await runWithUser('t62-actor', async () =>
        service.create({ name, countryCode: 'MX' }),
      );
      await expect(
        runWithUser('t62-actor', async () =>
          service.create({ name, countryCode: 'MX' }),
        ),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('mismo nombre otro pais', async () => {
      const name = `Cross Country ${suffix}`;
      const a = await runWithUser('t62-actor', async () =>
        service.create({ name, countryCode: 'MX' }),
      );
      const b = await runWithUser('t62-actor', async () =>
        service.create({ name, countryCode: 'CO' }),
      );
      expect(a.id).not.toBe(b.id);
    });

    it('recrear tras delete', async () => {
      const name = `Recreate ${suffix}`;
      const first = await runWithUser('t62-actor', async () =>
        service.create({ name, countryCode: 'MX' }),
      );
      await runWithUser('t62-actor', async () => service.remove(first.id));
      const second = await runWithUser('t62-actor', async () =>
        service.create({ name, countryCode: 'MX' }),
      );
      expect(second.id).not.toBe(first.id);
    });

    it('borrar con incubadoras', async () => {
      const name = `With Inc ${suffix}`;
      const institution = await runWithUser('t62-actor', async () =>
        service.create({ name, countryCode: 'MX' }),
      );
      await prisma.incubator.create({
        data: {
          name: `Inc ${suffix}`,
          slug: `inc-${suffix}`,
          institutionId: institution.id,
        },
      });
      await expect(
        runWithUser('t62-actor', async () => service.remove(institution.id)),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('If-Match version increment', async () => {
      const created = await runWithUser('t62-actor', async () =>
        service.create({
          name: `Versioned ${suffix}`,
          countryCode: 'MX',
        }),
      );
      expect(created.version).toBe(1);
      const updated = await runWithUser('t62-actor', async () =>
        service.update(created.id, 1, { name: `Versioned 2 ${suffix}` }),
      );
      expect(updated.version).toBe(2);
      await expect(
        runWithUser('t62-actor', async () =>
          service.update(created.id, 1, { name: 'stale' }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  },
);
