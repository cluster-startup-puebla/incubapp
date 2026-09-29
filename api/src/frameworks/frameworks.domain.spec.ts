import 'dotenv/config';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { runWithUser } from '../context/request-context.js';
import { FrameworksService } from './frameworks.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

(hasDatabase ? describe : describe.skip)(
  'T6.5 frameworks domain (integration)',
  () => {
    let prisma: Awaited<typeof import('../prisma/prisma.client.js')>['prisma'];
    let base: Awaited<
      typeof import('../prisma/prisma.client.js')
    >['baseClient'];
    let service: FrameworksService;
    const suffix = `${Date.now()}`;
    const ids: string[] = [];

    beforeAll(async () => {
      const mod = await import('../prisma/prisma.client.js');
      prisma = mod.prisma;
      base = mod.baseClient;
      service = new FrameworksService({
        client: prisma,
        base,
      } as unknown as PrismaService);
    });

    afterAll(async () => {
      if (ids.length > 0) {
        const list = ids.map((id) => `'${id}'`).join(',');
        await base.$executeRawUnsafe(
          `DELETE FROM milestone WHERE stage_id IN (SELECT id FROM framework_stage WHERE framework_id IN (${list}))`,
        );
        await base.$executeRawUnsafe(
          `DELETE FROM metric_def WHERE framework_id IN (${list})`,
        );
        await base.$executeRawUnsafe(
          `DELETE FROM framework_stage WHERE framework_id IN (${list})`,
        );
        await base.$executeRawUnsafe(
          `DELETE FROM framework WHERE id IN (${list})`,
        );
      }
      await prisma.$disconnect();
    });

    it('publicado inmutable', async () => {
      const fw = await runWithUser('t65-actor', async () =>
        service.create({
          name: `Pub ${suffix}`,
          stages: [{ name: 'S1', sortOrder: 1 }],
        }),
      );
      ids.push(fw.id);
      await runWithUser('t65-actor', async () =>
        service.publish(fw.id, ['cluster_admin']),
      );

      await expect(
        runWithUser('t65-actor', async () =>
          service.update(fw.id, 2, { name: 'Nope' }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('nueva version clone deja v1 intacta', async () => {
      const v1 = await runWithUser('t65-actor', async () =>
        service.create({
          name: `Clone ${suffix}`,
          stages: [{ name: 'S1', sortOrder: 1 }],
        }),
      );
      ids.push(v1.id);
      const published = await runWithUser('t65-actor', async () =>
        service.publish(v1.id, ['cluster_admin']),
      );
      expect(published.status).toBe('PUBLISHED');
      expect(published.majorVersion).toBe(1);

      const v2 = await runWithUser('t65-actor', async () =>
        service.clone(v1.id, ['cluster_admin']),
      );
      ids.push(v2.id);

      expect(v2.status).toBe('DRAFT');
      expect(v2.majorVersion).toBe(2);
      expect(v2.stages).toHaveLength(1);

      const still = await runWithUser('t65-actor', async () =>
        service.get(v1.id, { includeDrafts: true }),
      );
      expect(still.status).toBe('PUBLISHED');
      expect(still.majorVersion).toBe(1);
      expect(still.id).toBe(v1.id);
    });

    it('orden de etapas hueco o duplicado', async () => {
      const fw = await runWithUser('t65-actor', async () =>
        service.create({
          name: `Order ${suffix}`,
          stages: [{ name: 'S1', sortOrder: 1 }],
        }),
      );
      ids.push(fw.id);

      await expect(
        runWithUser('t65-actor', async () =>
          service.addStage(fw.id, { name: 'S3', sortOrder: 3 }),
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      await expect(
        runWithUser('t65-actor', async () =>
          service.addStage(fw.id, { name: 'Dup', sortOrder: 1 }),
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      const ok = await runWithUser('t65-actor', async () =>
        service.addStage(fw.id, { name: 'S2', sortOrder: 2 }),
      );
      expect(ok.sortOrder).toBe(2);
    });
  },
);
