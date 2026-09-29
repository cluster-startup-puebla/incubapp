import 'dotenv/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { runWithRequestContext } from '../context/request-context.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { upsertMetricReadingSchema } from './metric-reading.dto.js';
import { MetricReadingsService } from './metric-readings.service.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe('T6.12 metric readings domain extras', () => {
  it('rechaza id / deletedAt / createdById / incubatorId', () => {
    const base = {
      metricDefId: '01900000-0000-7000-8000-000000000002',
      period: '2026-01-15',
      value: 1,
    };
    expect(
      upsertMetricReadingSchema.safeParse({
        ...base,
        id: '01900000-0000-7000-8000-000000000099',
      }).success,
    ).toBe(false);
    expect(
      upsertMetricReadingSchema.safeParse({
        ...base,
        deletedAt: '2026-01-01',
      }).success,
    ).toBe(false);
    expect(
      upsertMetricReadingSchema.safeParse({
        ...base,
        createdById: 'actor-1',
      }).success,
    ).toBe(false);
    expect(
      upsertMetricReadingSchema.safeParse({
        ...base,
        incubatorId: '01900000-0000-7000-8000-000000000099',
      }).success,
    ).toBe(false);
  });

  it('period debe ser YYYY-MM-DD string', () => {
    expect(
      upsertMetricReadingSchema.safeParse({
        metricDefId: '01900000-0000-7000-8000-000000000002',
        period: new Date('2026-01-15'),
        value: 1,
      }).success,
    ).toBe(false);
    expect(
      upsertMetricReadingSchema.safeParse({
        metricDefId: '01900000-0000-7000-8000-000000000002',
        period: '2026-01-15',
        value: 1,
      }).success,
    ).toBe(true);
  });
});

(hasDatabase ? describe : describe.skip)(
  'T6.12 metric readings domain (integration)',
  () => {
    let prisma: Awaited<typeof import('../prisma/prisma.client.js')>['prisma'];
    let base: Awaited<
      typeof import('../prisma/prisma.client.js')
    >['baseClient'];
    let service: MetricReadingsService;
    const suffix = `${Date.now()}`;
    let incubatorId: string;
    let startupId: string;
    let metricDefId: string;
    let allowNegMetricId: string;
    let frameworkId: string;

    beforeAll(async () => {
      const mod = await import('../prisma/prisma.client.js');
      prisma = mod.prisma;
      base = mod.baseClient;
      service = new MetricReadingsService({
        client: prisma,
        base,
      } as unknown as PrismaService);

      const framework = await prisma.framework.create({
        data: {
          name: `T612 FW ${suffix}`,
          majorVersion: 1,
          status: 'PUBLISHED',
        },
      });
      frameworkId = framework.id;

      const metric = await prisma.metricDef.create({
        data: {
          frameworkId,
          key: `rev_${suffix.slice(-6)}`,
          name: 'Revenue',
          allowNegative: false,
        },
      });
      metricDefId = metric.id;

      const allowNeg = await prisma.metricDef.create({
        data: {
          frameworkId,
          key: `delta_${suffix.slice(-6)}`,
          name: 'Delta',
          allowNegative: true,
        },
      });
      allowNegMetricId = allowNeg.id;

      const incubator = await prisma.incubator.create({
        data: {
          name: `T612 Inc ${suffix}`,
          slug: `t612-inc-${suffix}`,
          frameworkId,
        },
      });
      incubatorId = incubator.id;

      const startup = await prisma.startup.create({
        data: {
          name: `T612 Startup ${suffix}`,
          domain: `t612-${suffix}.example`,
          incubatorId,
        },
      });
      startupId = startup.id;
    });

    afterAll(async () => {
      await base.$executeRawUnsafe(
        `DELETE FROM metric_reading WHERE startup_id = '${startupId}'`,
      );
      await base.$executeRawUnsafe(
        `DELETE FROM startup WHERE id = '${startupId}'`,
      );
      await base.$executeRawUnsafe(
        `DELETE FROM incubator WHERE id = '${incubatorId}'`,
      );
      await base.$executeRawUnsafe(
        `DELETE FROM metric_def WHERE framework_id = '${frameworkId}'`,
      );
      await base.$executeRawUnsafe(
        `DELETE FROM framework WHERE id = '${frameworkId}'`,
      );
      await prisma.$disconnect();
    });

    beforeEach(async () => {
      await base.$executeRawUnsafe(
        `DELETE FROM metric_reading WHERE startup_id = '${startupId}'`,
      );
    });

    function asActor<T>(fn: () => T): T {
      return runWithRequestContext(
        {
          userId: 't612-actor',
          actorId: 't612-actor',
          incubatorId,
          isSuperAdmin: false,
        },
        fn,
      );
    }

    it('upsert mismo startup+metric+period → una fila valor nuevo', async () => {
      const first = await asActor(() =>
        service.upsert(startupId, {
          metricDefId,
          period: '2026-01-15',
          value: 10,
        }),
      );
      expect(first.created).toBe(true);

      const second = await asActor(() =>
        service.upsert(startupId, {
          metricDefId,
          period: '2026-01-15',
          value: 99,
        }),
      );
      expect(second.created).toBe(false);
      expect(second.row.id).toBe(first.row.id);
      expect(second.row.value).toBe(99);

      const count = await asActor(() =>
        prisma.metricReading.count({ where: { startupId } }),
      );
      expect(count).toBe(1);
    });

    it('negativo no permitido → 400', async () => {
      await expect(
        asActor(() =>
          service.upsert(startupId, {
            metricDefId,
            period: '2026-01-15',
            value: -3,
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('negativo permitido cuando allowNegative', async () => {
      const result = await asActor(() =>
        service.upsert(startupId, {
          metricDefId: allowNegMetricId,
          period: '2026-01-15',
          value: -3,
        }),
      );
      expect(result.row.value).toBe(-3);
    });

    it('periodo futuro → 400', async () => {
      await expect(
        asActor(() =>
          service.upsert(startupId, {
            metricDefId,
            period: '2099-12-31',
            value: 1,
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('edit tras verifiedAt limpia verificacion', async () => {
      const created = await asActor(() =>
        service.upsert(startupId, {
          metricDefId,
          period: '2026-01-15',
          value: 10,
        }),
      );
      const verified = await asActor(() =>
        service.verify(startupId, created.row.id, {
          roles: ['director'],
        }),
      );
      expect(verified.verifiedAt).not.toBeNull();

      const edited = await asActor(() =>
        service.upsert(startupId, {
          metricDefId,
          period: '2026-01-15',
          value: 20,
        }),
      );
      expect(edited.row.verifiedAt).toBeNull();
      expect(edited.row.verifiedById).toBeNull();
      expect(edited.row.value).toBe(20);
    });

    it('founder verifica → 403', async () => {
      const created = await asActor(() =>
        service.upsert(startupId, {
          metricDefId,
          period: '2026-01-15',
          value: 10,
        }),
      );
      await expect(
        asActor(() =>
          service.verify(startupId, created.row.id, {
            roles: ['founder'],
          }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lista larga cursor sin total', async () => {
      for (let i = 0; i < 5; i += 1) {
        await asActor(() =>
          service.upsert(startupId, {
            metricDefId,
            period: `2026-01-${String(i + 1).padStart(2, '0')}`,
            value: i,
          }),
        );
      }

      const page1 = await asActor(() => service.list({ startupId, take: 2 }));
      expect(page1.items).toHaveLength(2);
      expect(page1).not.toHaveProperty('total');

      const last = page1.items[page1.items.length - 1];
      const { encodeCursor } = await import('../common/query/pagination.js');
      const page2 = await asActor(() =>
        service.list({
          startupId,
          take: 2,
          cursor: encodeCursor({
            id: last.id,
            createdAt: last.createdAt.toISOString(),
          }),
        }),
      );
      expect(page2.items.length).toBeGreaterThan(0);
      expect(page2).not.toHaveProperty('total');
      const ids = new Set([
        ...page1.items.map((r) => r.id),
        ...page2.items.map((r) => r.id),
      ]);
      expect(ids.size).toBe(page1.items.length + page2.items.length);
    });
  },
);
