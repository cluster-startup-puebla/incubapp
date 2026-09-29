import {
  ConflictException,
  HttpException,
  HttpStatus,
  INestApplication,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_PIPE } from '@nestjs/core';
import request from 'supertest';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { EnvelopeInterceptor } from '../common/http/envelope.interceptor.js';
import { ProblemDetailsFilter } from '../common/http/problem-details.filter.js';
import { IncubationsController } from './incubations.controller.js';
import { IncubationsService } from './incubations.service.js';
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
const INCUBATOR_ID = '01900000-0000-7000-8000-000000000010';

describe('IncubationsController (HTTP)', () => {
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
      controllers: [IncubationsController],
      providers: [
        { provide: IncubationsService, useValue: service },
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
      incubatorId: INCUBATOR_ID,
      status: 'applied',
      version: 1,
      startedOn: null,
      endedOn: null,
      exitReason: null,
    };
    service.create.mockResolvedValue(row);

    const res = await request(app.getHttpServer())
      .post('/api/v1/incubations')
      .send({})
      .expect(201);

    expect(res.headers.location).toBe(`/api/v1/incubations/${ID}`);
    expect(res.body).toEqual({ data: row });
  });

  it('update If-Match required', async () => {
    service.get.mockResolvedValue({
      id: ID,
      status: 'applied',
      version: 1,
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/incubations/${ID}`)
      .send({ status: 'active' })
      .expect(428);

    expect(res.body).toMatchObject({ status: 428 });
  });

  it('update applied → active 200', async () => {
    service.get.mockResolvedValue({
      id: ID,
      status: 'applied',
      version: 1,
    });
    service.update.mockResolvedValue({
      id: ID,
      status: 'active',
      version: 2,
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/incubations/${ID}`)
      .set('If-Match', '1')
      .send({ status: 'active' })
      .expect(200);

    expect((res.body as { data: { status: string } }).data.status).toBe(
      'active',
    );
    expect(service.update.calls[0]).toEqual([
      ID,
      1,
      expect.objectContaining({ status: 'active' }),
    ]);
  });

  it('update graduated → active 409', async () => {
    service.get.mockResolvedValue({
      id: ID,
      status: 'graduated',
      version: 3,
    });
    service.update.mockRejectedValue(
      new ConflictException(
        'Cannot transition incubation from graduated to active',
      ),
    );

    await request(app.getHttpServer())
      .patch(`/api/v1/incubations/${ID}`)
      .set('If-Match', '3')
      .send({ status: 'active' })
      .expect(409);
  });

  it('fechas endedOn < startedOn → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/incubations')
      .send({
        startedOn: '2026-06-01',
        endedOn: '2026-05-01',
      })
      .expect(400);

    expect(res.body).toMatchObject({ status: 400 });
  });

  it('dropped sin exitReason → 422', async () => {
    service.get.mockResolvedValue({
      id: ID,
      status: 'active',
      version: 2,
    });
    service.update.mockRejectedValue(
      new UnprocessableEntityException(
        'exitReason is required when status is dropped',
      ),
    );

    await request(app.getHttpServer())
      .patch(`/api/v1/incubations/${ID}`)
      .set('If-Match', '2')
      .send({ status: 'dropped' })
      .expect(422);
  });

  it('rechaza id en body', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/incubations')
      .send({ id: ID, status: 'applied' })
      .expect(400);
  });

  it('get 404', async () => {
    service.get.mockRejectedValue(
      new NotFoundException('Incubation not found'),
    );
    await request(app.getHttpServer())
      .get(`/api/v1/incubations/${ID}`)
      .expect(404);
  });

  it('delete 204', async () => {
    service.get.mockResolvedValue({ id: ID, status: 'applied', version: 1 });
    service.remove.mockResolvedValue({ id: ID });
    await request(app.getHttpServer())
      .delete(`/api/v1/incubations/${ID}`)
      .expect(204);
  });

  it('version conflict 409', async () => {
    service.get.mockResolvedValue({ id: ID, status: 'applied', version: 1 });
    service.update.mockRejectedValue(new ConflictException('Version conflict'));
    await request(app.getHttpServer())
      .patch(`/api/v1/incubations/${ID}`)
      .set('If-Match', '1')
      .send({ status: 'active' })
      .expect(409);
  });

  it('envelope list', async () => {
    service.list.mockResolvedValue({
      items: [{ id: ID, status: 'applied' }],
      total: 1,
    });
    const res = await request(app.getHttpServer())
      .get('/api/v1/incubations')
      .expect(200);
    expect((res.body as { data: unknown[] }).data).toHaveLength(1);
    expect((res.body as { meta: { total: number } }).meta).toMatchObject({
      total: 1,
    });
  });

  it('HttpException passthrough', async () => {
    service.get.mockRejectedValue(
      new HttpException('nope', HttpStatus.BAD_GATEWAY),
    );
    await request(app.getHttpServer())
      .get(`/api/v1/incubations/${ID}`)
      .expect(502);
  });
});
