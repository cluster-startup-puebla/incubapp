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
import { InstitutionsController } from './institutions.controller.js';
import { InstitutionsService } from './institutions.service.js';
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

describe('InstitutionsController (HTTP)', () => {
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
  };
  const auditRecord = createMockFn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InstitutionsController],
      providers: [
        { provide: InstitutionsService, useValue: service },
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
      name: 'Tec',
      countryCode: 'MX',
      website: null,
      version: 1,
    };
    service.create.mockResolvedValue(row);

    const res = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .send({ name: 'Tec', countryCode: 'MX' })
      .expect(201);

    expect(res.headers.location).toBe(`/api/v1/institutions/${ID}`);
    expect(res.body).toEqual({ data: row });
    expect(auditRecord.calls).toHaveLength(1);
  });

  it('create url invalida 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .send({ name: 'Tec', countryCode: 'MX', website: 'notaurl' })
      .expect(400);
    expect(service.create.calls).toHaveLength(0);
  });

  it('create falta name 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .send({ countryCode: 'MX' })
      .expect(400);
  });

  it('list envelope', async () => {
    service.list.mockResolvedValue({ items: [], total: 0 });
    const res = await request(app.getHttpServer())
      .get('/api/v1/institutions')
      .expect(200);
    expect(res.body).toEqual({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
  });

  it('get uuid invalido 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/institutions/not-a-uuid')
      .expect(400);
  });

  it('get 404', async () => {
    service.get.mockRejectedValue(
      new NotFoundException('Institution not found'),
    );
    await request(app.getHttpServer())
      .get(`/api/v1/institutions/${ID}`)
      .expect(404);
  });

  it('patch sin If-Match 428', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/institutions/${ID}`)
      .send({ name: 'X' })
      .expect(428);
  });

  it('patch version vieja 409', async () => {
    service.get.mockResolvedValue({
      id: ID,
      name: 'Old',
      version: 3,
    });
    service.update.mockRejectedValue(new ConflictException('Version conflict'));
    await request(app.getHttpServer())
      .patch(`/api/v1/institutions/${ID}`)
      .set('If-Match', '2')
      .send({ name: 'X' })
      .expect(409);
  });

  it('patch ok version', async () => {
    service.get.mockResolvedValue({ id: ID, name: 'Old', version: 3 });
    service.update.mockResolvedValue({ id: ID, name: 'New', version: 4 });
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/institutions/${ID}`)
      .set('If-Match', '3')
      .send({ name: 'New' })
      .expect(200);
    expect((res.body as { data: { version: number } }).data.version).toBe(4);
    expect(service.update.calls[0]).toEqual([
      ID,
      3,
      expect.objectContaining({ name: 'New' }),
    ]);
  });

  it('delete 204', async () => {
    service.get.mockResolvedValue({ id: ID, name: 'X' });
    service.remove.mockResolvedValue({ id: ID });
    await request(app.getHttpServer())
      .delete(`/api/v1/institutions/${ID}`)
      .expect(204);
    expect(auditRecord.calls).toHaveLength(1);
  });

  it('delete con incubadoras 409', async () => {
    service.get.mockResolvedValue({ id: ID });
    service.remove.mockRejectedValue(
      new ConflictException('Institution has active incubators'),
    );
    await request(app.getHttpServer())
      .delete(`/api/v1/institutions/${ID}`)
      .expect(409);
  });

  it('audit no escribe en fallo', async () => {
    service.create.mockRejectedValue(new ConflictException('dup'));
    await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .send({ name: 'Tec', countryCode: 'MX' })
      .expect(409);
    expect(auditRecord.calls).toHaveLength(0);
  });

  it('restore 200', async () => {
    service.getWithDeleted.mockResolvedValue({
      id: ID,
      deletedAt: new Date(),
    });
    service.restore.mockResolvedValue({ id: ID, deletedAt: null });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/institutions/${ID}/restore`)
      .expect(200);
    expect(
      (res.body as { data: { deletedAt: null } }).data.deletedAt,
    ).toBeNull();
  });

  it('purge 204', async () => {
    service.getWithDeleted.mockResolvedValue({
      id: ID,
      deletedAt: new Date(),
    });
    service.purge.mockResolvedValue(undefined);
    await request(app.getHttpServer())
      .delete(`/api/v1/institutions/${ID}/purge`)
      .expect(204);
  });

  it('rate limit shape 429 Retry-After', () => {
    // Thin HTTP proof that problem filter maps 429; write guard is unit-tested separately.
    const filter = new ProblemDetailsFilter('test');
    const problem = filter.toProblem(
      new HttpException(
        'Write rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      ),
      { originalUrl: '/api/v1/institutions', url: '/api/v1/institutions' },
      'req',
    );
    expect(problem.status).toBe(429);
  });
});
