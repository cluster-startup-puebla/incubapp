import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_PIPE } from '@nestjs/core';
import request from 'supertest';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { EnvelopeInterceptor } from '../common/http/envelope.interceptor.js';
import { ProblemDetailsFilter } from '../common/http/problem-details.filter.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

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

describe('AnalyticsController (HTTP)', () => {
  let app: INestApplication;
  const service = {
    overview: createMockFn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: service },
        EnvelopeInterceptor,
        {
          provide: APP_PIPE,
          useClass: ZodValidationPipe,
        },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalInterceptors(moduleRef.get(EnvelopeInterceptor));
    app.useGlobalFilters(new ProblemDetailsFilter('test'));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    service.overview.calls.length = 0;
    service.overview.mockResolvedValue({
      incubators: 2,
      stages: 5,
      startups: 3,
      funnel: { applied: 4, active: 2, graduated: 1, dropped: 1 },
    });
  });

  it('GET overview → envelope resource', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/analytics/overview')
      .expect(200);

    expect(res.body).toEqual({
      data: {
        incubators: 2,
        stages: 5,
        startups: 3,
        funnel: { applied: 4, active: 2, graduated: 1, dropped: 1 },
      },
    });
  });

  it('from > to → 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/analytics/overview')
      .query({ from: '2026-02-01', to: '2026-01-01' })
      .expect(400);
  });

  it('pasa from/to al service', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/analytics/overview')
      .query({ from: '2026-01-01', to: '2026-01-31' })
      .expect(200);

    expect(service.overview.calls[0]?.[0]).toMatchObject({
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });
});
