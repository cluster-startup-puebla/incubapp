import 'dotenv/config';
import { runWithUser } from '../context/request-context.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

(hasDatabase ? describe : describe.skip)(
  'soft-delete extension (integration)',
  () => {
    let prisma: Awaited<typeof import('./prisma.client.js')>['prisma'];

    beforeAll(async () => {
      ({ prisma } = await import('./prisma.client.js'));
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('list oculta borrados and delete is soft', async () => {
      const suffix = `${Date.now()}`;
      const active = await runWithUser('integ-actor', async () =>
        prisma.institution.create({
          data: {
            name: `Soft Active ${suffix}`,
            countryCode: 'MX',
          },
        }),
      );
      expect(active.createdById).toBe('integ-actor');

      const doomed = await prisma.institution.create({
        data: {
          name: `Soft Doomed ${suffix}`,
          countryCode: 'MX',
        },
      });

      await runWithUser('integ-actor', async () =>
        prisma.institution.delete({ where: { id: doomed.id } }),
      );

      const listed = await prisma.institution.findMany({
        where: {
          OR: [
            { name: `Soft Active ${suffix}` },
            { name: `Soft Doomed ${suffix}` },
          ],
        },
      });
      expect(listed.map((row) => row.id)).toEqual([active.id]);

      const gone = await prisma.institution.findUnique({
        where: { id: doomed.id },
      });
      expect(gone).toBeNull();

      const visibleWhenAsked = await prisma.institution.findUnique({
        where: { id: doomed.id },
        ...({ withDeleted: true } as object),
      });
      expect(visibleWhenAsked?.id).toBe(doomed.id);

      const withDeleted = await prisma.institution.findMany({
        where: {
          OR: [
            { name: `Soft Active ${suffix}` },
            { name: `Soft Doomed ${suffix}` },
          ],
        },
        ...({ withDeleted: true } as object),
      });
      expect(withDeleted).toHaveLength(2);

      const restored = await (
        prisma.institution as typeof prisma.institution & {
          restore: (
            id: string,
          ) => Promise<{ id: string; deletedAt: Date | null }>;
        }
      ).restore(doomed.id);
      expect(restored.deletedAt).toBeNull();

      const afterRestore = await prisma.institution.findUnique({
        where: { id: doomed.id },
      });
      expect(afterRestore?.id).toBe(doomed.id);

      await prisma.$executeRawUnsafe(
        `DELETE FROM institution WHERE name LIKE '%${suffix.replace(/'/g, "''")}%'`,
      );
    });
  },
);
