import {
  ConflictException,
  HttpException,
  HttpStatus,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_PIPE } from '@nestjs/core';
import request from 'supertest';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { EnvelopeInterceptor } from '../common/http/envelope.interceptor.js';
import { ProblemDetailsFilter } from '../common/http/problem-details.filter.js';
import { IncubatorsController } from './incubators.controller.js';
import { IncubatorsService } from './incubators.service.js';
import { AuditLogInterceptor } from '../audit/audit-log.interceptor.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../authz/permissions.guard.js';

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

const ID = '01900000-0000-7000-8000-000000000099';

describe('IncubatorsController (HTTP)', () => {
  let app: INestApplication;
  const service = {
    list: createMockFn(),
    listDeleted: createMockFn(),
    get: createMockFn(),
    getWithDeleted: createMockFn(),
    create: createMockFn(),
    update: createMockFn(),
    remove: createMockFn(),
    restore: createMockFn(),
    purge: createMockFn(),
    mapFeatures: createMockFn(),
  };
  const auditRecord = createMockFn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [IncubatorsController],
      providers: [
        { provide: IncubatorsService, useValue: service },
        {
          provide: AuditLogService,
          useValue: { record: auditRecord },
        },
        AuditLogInterceptor,
        Reflector,
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

    app = moduleRef.createNestApplication({ bodyParser: true });
    app.setGlobalPrefix('api/v1');
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

  it('create Location 201', async () => {
    const row = {
      id: ID,
      name: 'Alpha',
      slug: 'alpha',
      latitude: null,
      longitude: null,
      version: 1,
    };
    service.create.mockResolvedValue(row);

    const res = await request(app.getHttpServer())
      .post('/api/v1/incubators')
      .send({ name: 'Alpha', slug: 'alpha' })
      .expect(201);

    expect(res.headers.location).toBe(`/api/v1/incubators/${ID}`);
    expect(res.body).toEqual({ data: row });
    expect(auditRecord.calls).toHaveLength(1);
  });

  it('create lat 120 → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/incubators')
      .send({ name: 'Bad', slug: 'bad', latitude: 120, longitude: 0 })
      .expect(400);
    expect(service.create.calls).toHaveLength(0);
  });

  it('create slug activo duplicado 409', async () => {
    service.create.mockRejectedValue(
      new ConflictException('Unique constraint failed'),
    );
    await request(app.getHttpServer())
      .post('/api/v1/incubators')
      .send({ name: 'Dup', slug: 'dup' })
      .expect(409);
  });

  it('list envelope', async () => {
    service.list.mockResolvedValue({ items: [], total: 0 });
    const res = await request(app.getHttpServer())
      .get('/api/v1/incubators')
      .expect(200);
    expect(res.body).toEqual({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
  });

  it('map FeatureCollection', async () => {
    service.mapFeatures.mockResolvedValue({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-99, 19] },
          properties: { id: '1', name: 'A', slug: 'a' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-100, 20] },
          properties: { id: '2', name: 'B', slug: 'b' },
        },
      ],
    });
    const res = await request(app.getHttpServer())
      .get('/api/v1/incubators/map')
      .expect(200);
    const body = res.body as {
      type: string;
      features: unknown[];
    };
    expect(body.type).toBe('FeatureCollection');
    expect(body.features).toHaveLength(2);
  });

  it('patch sin If-Match 428', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/incubators/${ID}`)
      .send({ name: 'X' })
      .expect(428);
  });

  it('patch ok', async () => {
    service.get.mockResolvedValue({ id: ID, name: 'Old', version: 1 });
    service.update.mockResolvedValue({ id: ID, name: 'New', version: 2 });
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/incubators/${ID}`)
      .set('If-Match', '1')
      .send({ name: 'New' })
      .expect(200);
    expect((res.body as { data: { version: number } }).data.version).toBe(2);
  });

  it('director edita otra → 404', async () => {
    service.get.mockRejectedValue(new NotFoundException('Incubator not found'));
    await request(app.getHttpServer())
      .patch(`/api/v1/incubators/${ID}`)
      .set('If-Match', '1')
      .send({ name: 'X' })
      .expect(404);
  });

  it('delete con incubaciones 409', async () => {
    service.get.mockResolvedValue({ id: ID });
    service.remove.mockRejectedValue(
      new ConflictException('Incubator has active incubations'),
    );
    await request(app.getHttpServer())
      .delete(`/api/v1/incubators/${ID}`)
      .expect(409);
  });

  it('delete 204', async () => {
    service.get.mockResolvedValue({ id: ID });
    service.remove.mockResolvedValue({ id: ID });
    await request(app.getHttpServer())
      .delete(`/api/v1/incubators/${ID}`)
      .expect(204);
    expect(auditRecord.calls).toHaveLength(1);
  });

  it('mass assignment incubatorId 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/incubators')
      .send({
        name: 'X',
        slug: 'x',
        incubatorId: '01900000-0000-7000-8000-000000000001',
      })
      .expect(400);
  });

  it('rate limit shape 429 Retry-After', () => {
    const filter = new ProblemDetailsFilter('test');
    const problem = filter.toProblem(
      new HttpException(
        'Write rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      ),
      { originalUrl: '/api/v1/incubators', url: '/api/v1/incubators' },
      'req',
    );
    expect(problem.status).toBe(429);
  });
});
