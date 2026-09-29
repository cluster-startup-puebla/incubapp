import { ForbiddenException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_PIPE } from '@nestjs/core';
import request from 'supertest';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { EnvelopeInterceptor } from '../common/http/envelope.interceptor.js';
import { ProblemDetailsFilter } from '../common/http/problem-details.filter.js';
import { MetricReadingsController } from './metric-readings.controller.js';
import { MetricReadingsService } from './metric-readings.service.js';
import { AuditLogInterceptor } from '../audit/audit-log.interceptor.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { IdempotencyGuard } from '../idempotency/idempotency.guard.js';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor.js';
import {
  IDEMPOTENCY_HEADER,
  IDEMPOTENCY_STORE,
  createMemoryIdempotencyStore,
} from '../idempotency/idempotency.store.js';
import { encodeCursor } from '../common/query/pagination.js';

function createMockFn<Args extends unknown[] = unknown[], Result = unknown>() {
  let resolved: Result | undefined;
  let rejected: unknown;
  let impl: ((...args: Args) => Promise<Result>) | undefined;
  const calls: Args[] = [];
  const fn = ((...args: Args) => {
    calls.push(args);
    if (impl) {
      return impl(...args);
    }
    if (rejected !== undefined) {
      return Promise.reject(
        rejected instanceof Error ? rejected : new Error('mock rejection'),
      );
    }
    return Promise.resolve(resolved as Result);
  }) as ((...args: Args) => Promise<Result>) & {
    calls: Args[];
    mockResolvedValue: (value: Result) => void;
    mockRejectedValue: (error: unknown) => void;
    mockImplementation: (fn: (...args: Args) => Promise<Result>) => void;
  };
  fn.calls = calls;
  fn.mockResolvedValue = (value: Result) => {
    resolved = value;
    rejected = undefined;
    impl = undefined;
  };
  fn.mockRejectedValue = (error: unknown) => {
    rejected = error;
    impl = undefined;
  };
  fn.mockImplementation = (next: (...args: Args) => Promise<Result>) => {
    impl = next;
  };
  return fn;
}

const STARTUP_ID = '01900000-0000-7000-8000-000000000001';
const METRIC_ID = '01900000-0000-7000-8000-000000000002';
const READING_ID = '01900000-0000-7000-8000-000000000004';

describe('MetricReadingsController (HTTP)', () => {
  let app: INestApplication;
  const service = {
    list: createMockFn(),
    get: createMockFn(),
    upsert: createMockFn(),
    verify: createMockFn(),
  };
  const auditRecord = createMockFn();
  const store = createMemoryIdempotencyStore();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MetricReadingsController],
      providers: [
        { provide: MetricReadingsService, useValue: service },
        {
          provide: AuditLogService,
          useValue: { record: auditRecord },
        },
        AuditLogInterceptor,
        Reflector,
        EnvelopeInterceptor,
        { provide: IDEMPOTENCY_STORE, useValue: store },
        IdempotencyGuard,
        IdempotencyInterceptor,
        {
          provide: APP_PIPE,
          useClass: ZodValidationPipe,
        },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication({ bodyParser: true });
    app.setGlobalPrefix('api/v1');
    app.use(
      (
        req: { user?: { id: string } },
        _res: unknown,
        next: () => void,
      ): void => {
        req.user = { id: 'user-http-1' };
        next();
      },
    );
    app.useGlobalInterceptors(moduleRef.get(EnvelopeInterceptor));
    app.useGlobalFilters(new ProblemDetailsFilter('test'));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    for (const fn of Object.values(service)) {
      fn.calls.length = 0;
      fn.mockResolvedValue(undefined);
    }
    auditRecord.calls.length = 0;
    auditRecord.mockResolvedValue(undefined);
  });

  it('upsert Location 201', async () => {
    const row = {
      id: READING_ID,
      startupId: STARTUP_ID,
      metricDefId: METRIC_ID,
      period: '2026-01-15',
      value: 10,
      version: 1,
    };
    service.upsert.mockResolvedValue({ row, created: true });

    const res = await request(app.getHttpServer())
      .put(`/api/v1/startups/${STARTUP_ID}/metrics`)
      .set(IDEMPOTENCY_HEADER, 'http-create-1')
      .send({
        metricDefId: METRIC_ID,
        period: '2026-01-15',
        value: 10,
      })
      .expect(201);

    expect(res.headers.location).toBe(
      `/api/v1/startups/${STARTUP_ID}/metrics/${READING_ID}`,
    );
    expect(res.body).toEqual({ data: row });
    expect(service.upsert.calls).toHaveLength(1);
  });

  it('misma Idempotency-Key → un solo write', async () => {
    const row = {
      id: READING_ID,
      startupId: STARTUP_ID,
      metricDefId: METRIC_ID,
      period: '2026-01-15',
      value: 10,
      version: 1,
    };
    service.upsert.mockResolvedValue({ row, created: true });
    const body = {
      metricDefId: METRIC_ID,
      period: '2026-01-15',
      value: 10,
    };
    const key = 'http-idempotent-replay';

    const first = await request(app.getHttpServer())
      .put(`/api/v1/startups/${STARTUP_ID}/metrics`)
      .set(IDEMPOTENCY_HEADER, key)
      .send(body)
      .expect(201);

    const second = await request(app.getHttpServer())
      .put(`/api/v1/startups/${STARTUP_ID}/metrics`)
      .set(IDEMPOTENCY_HEADER, key)
      .send(body)
      .expect(201);

    expect(second.body).toEqual(first.body);
    expect(service.upsert.calls).toHaveLength(1);
  });

  it('lista cursor sin total en meta', async () => {
    const items = [
      {
        id: '01900000-0000-7000-8000-000000000011',
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        value: 1,
      },
      {
        id: '01900000-0000-7000-8000-000000000012',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        value: 2,
      },
    ];
    service.list.mockResolvedValue({ items, pageSize: 2 });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/startups/${STARTUP_ID}/metrics`)
      .query({ pageSize: 2 })
      .expect(200);

    const body = res.body as {
      data: unknown[];
      meta: { pageSize: number; nextCursor: string | null };
    };
    expect(body.data).toHaveLength(2);
    expect(body.meta).not.toHaveProperty('total');
    expect(body.meta.pageSize).toBe(2);
    expect(typeof body.meta.nextCursor === 'string').toBe(true);
  });

  it('lista con cursor invalido → 400', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/startups/${STARTUP_ID}/metrics`)
      .query({ cursor: 'not-valid!!!' })
      .expect(400);
  });

  it('lista con cursor valido', async () => {
    service.list.mockResolvedValue({ items: [], pageSize: 20 });
    const cursor = encodeCursor({
      id: READING_ID,
      createdAt: new Date('2026-01-01').toISOString(),
    });

    await request(app.getHttpServer())
      .get(`/api/v1/startups/${STARTUP_ID}/metrics`)
      .query({ cursor })
      .expect(200);

    expect(service.list.calls[0]?.[0]).toMatchObject({
      startupId: STARTUP_ID,
      cursor,
    });
  });

  it('verify founder → 403', async () => {
    service.get.mockResolvedValue({
      id: READING_ID,
      startupId: STARTUP_ID,
      version: 1,
    });
    service.verify.mockRejectedValue(
      new ForbiddenException(
        'Only staff or director roles may verify metric readings',
      ),
    );

    await request(app.getHttpServer())
      .post(`/api/v1/startups/${STARTUP_ID}/metrics/${READING_ID}/verify`)
      .expect(403);
  });

  it('upsert rechaza campos prohibidos', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/startups/${STARTUP_ID}/metrics`)
      .set(IDEMPOTENCY_HEADER, 'forbidden-fields')
      .send({
        metricDefId: METRIC_ID,
        period: '2026-01-15',
        value: 1,
        id: READING_ID,
      })
      .expect(400);

    expect(service.upsert.calls).toHaveLength(0);
  });
});
