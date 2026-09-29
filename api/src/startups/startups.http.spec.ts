import {
  ConflictException,
  ForbiddenException,
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
import { StartupsController } from './startups.controller.js';
import { StartupsService } from './startups.service.js';
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

const ID = '01900000-0000-7000-8000-0000000000a1';

describe('StartupsController (HTTP)', () => {
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
      controllers: [StartupsController],
      providers: [
        { provide: StartupsService, useValue: service },
        { provide: AuditLogService, useValue: { record: auditRecord } },
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

  it('alta Location 201', async () => {
    const row = {
      id: ID,
      name: 'Acme',
      domain: 'acme.com',
      visibility: 'INCUBATOR',
      version: 1,
    };
    service.create.mockResolvedValue(row);

    const res = await request(app.getHttpServer())
      .post('/api/v1/startups')
      .send({ name: 'Acme', domain: 'acme.com' })
      .expect(201);

    expect(res.headers.location).toBe(`/api/v1/startups/${ID}`);
    expect(res.body).toEqual({ data: row });
    expect(service.create.calls[0][1]).toMatchObject({ force: false });
  });

  it('parecido dominio 409 con candidates', async () => {
    service.create.mockRejectedValue(
      new ConflictException({
        message: 'Similar startups exist for this domain',
        candidates: [{ id: ID, name: 'Acme', domain: 'acme.com' }],
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/startups')
      .send({ name: 'Acme 2', domain: 'acme.com' })
      .expect(409);

    expect(res.body).toMatchObject({
      status: 409,
      candidates: [{ id: ID, domain: 'acme.com' }],
    });
  });

  it('force admin pasa force=true', async () => {
    service.create.mockResolvedValue({
      id: ID,
      name: 'Forced',
      domain: 'acme.com',
      version: 1,
    });

    await request(app.getHttpServer())
      .post('/api/v1/startups?force=true')
      .send({ name: 'Forced', domain: 'acme.com' })
      .expect(201);

    expect(service.create.calls[0][1]).toMatchObject({ force: true });
  });

  it('force founder 403', async () => {
    service.create.mockRejectedValue(
      new ForbiddenException(
        'Only super admin may force-create despite domain similarity',
      ),
    );

    await request(app.getHttpServer())
      .post('/api/v1/startups?force=true')
      .send({ name: 'Nope', domain: 'acme.com' })
      .expect(403);
  });

  it('founder edita la suya 200', async () => {
    const row = {
      id: ID,
      name: 'Acme',
      domain: 'acme.com',
      version: 1,
      ownerUserId: 'founder-1',
    };
    service.get.mockResolvedValue(row);
    service.update.mockResolvedValue({ ...row, name: 'Acme 2', version: 2 });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/startups/${ID}`)
      .set('If-Match', '"1"')
      .send({ name: 'Acme 2' })
      .expect(200);

    expect((res.body as { data: { name: string } }).data.name).toBe('Acme 2');
  });

  it('founder edita otra 404', async () => {
    service.get.mockResolvedValue({
      id: ID,
      name: 'Other',
      version: 1,
      ownerUserId: 'other',
    });
    service.update.mockRejectedValue(
      new NotFoundException('Startup not found'),
    );

    await request(app.getHttpServer())
      .patch(`/api/v1/startups/${ID}`)
      .set('If-Match', '"1"')
      .send({ name: 'Hack' })
      .expect(404);
  });

  it('visibilidad private get 404', async () => {
    service.get.mockRejectedValue(new NotFoundException('Startup not found'));

    await request(app.getHttpServer())
      .get(`/api/v1/startups/${ID}`)
      .expect(404);
  });

  it('create sin domain 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/startups')
      .send({ name: 'Acme' })
      .expect(400);
    expect(service.create.calls).toHaveLength(0);
  });

  it('update sin If-Match 428', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/startups/${ID}`)
      .send({ name: 'Acme' })
      .expect(428);
  });

  it('mass assignment incubatorId 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/startups')
      .send({
        name: 'Acme',
        domain: 'acme.com',
        incubatorId: '01900000-0000-7000-8000-000000000099',
      })
      .expect(400);
  });

  it('delete 204', async () => {
    service.get.mockResolvedValue({ id: ID, version: 1 });
    service.remove.mockResolvedValue({ id: ID });

    await request(app.getHttpServer())
      .delete(`/api/v1/startups/${ID}`)
      .expect(204);
  });

  it('version conflict 409', async () => {
    service.get.mockResolvedValue({ id: ID, version: 2 });
    service.update.mockRejectedValue(new ConflictException('Version conflict'));

    await request(app.getHttpServer())
      .patch(`/api/v1/startups/${ID}`)
      .set('If-Match', '"1"')
      .send({ name: 'Stale' })
      .expect(409);
  });

  it('HttpException 422 passthrough', async () => {
    service.create.mockRejectedValue(
      new HttpException('unprocessable', HttpStatus.UNPROCESSABLE_ENTITY),
    );

    await request(app.getHttpServer())
      .post('/api/v1/startups')
      .send({ name: 'X', domain: 'x.com' })
      .expect(422);
  });
});
