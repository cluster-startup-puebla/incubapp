import {
  ConflictException,
  HttpException,
  HttpStatus,
  INestApplication,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_PIPE } from '@nestjs/core';
import request from 'supertest';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { EnvelopeInterceptor } from '../common/http/envelope.interceptor.js';
import { ProblemDetailsFilter } from '../common/http/problem-details.filter.js';
import { FrameworksController } from './frameworks.controller.js';
import { FrameworksService } from './frameworks.service.js';
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

const ID = '01900000-0000-7000-8000-0000000000f1';
const ID_V2 = '01900000-0000-7000-8000-0000000000f2';

describe('FrameworksController (HTTP)', () => {
  let app: INestApplication;
  const service = {
    list: createMockFn(),
    listDeleted: createMockFn(),
    get: createMockFn(),
    getWithDeleted: createMockFn(),
    create: createMockFn(),
    update: createMockFn(),
    addStage: createMockFn(),
    publish: createMockFn(),
    clone: createMockFn(),
    remove: createMockFn(),
    restore: createMockFn(),
    purge: createMockFn(),
  };
  const auditRecord = createMockFn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FrameworksController],
      providers: [
        { provide: FrameworksService, useValue: service },
        { provide: AuditLogService, useValue: { record: auditRecord } },
        AuditLogInterceptor,
        Reflector,
        {
          provide: APP_PIPE,
          useClass: ZodValidationPipe,
        },
        {
          provide: PermissionsGuard,
          useValue: { canActivate: () => true },
        },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalInterceptors(new EnvelopeInterceptor());
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
  });

  it('publicado inmutable 409', async () => {
    service.get.mockResolvedValue({
      id: ID,
      status: 'PUBLISHED',
      version: 1,
      stages: [],
    });
    service.update.mockRejectedValue(
      new ConflictException(
        'Published frameworks are immutable; clone to a new major version',
      ),
    );

    await request(app.getHttpServer())
      .patch(`/api/v1/frameworks/${ID}`)
      .set('If-Match', '"1"')
      .send({ name: 'Hack' })
      .expect(409);
  });

  it('nueva version clone 201', async () => {
    service.get.mockResolvedValue({
      id: ID,
      status: 'PUBLISHED',
      majorVersion: 1,
      version: 1,
      stages: [],
    });
    service.clone.mockResolvedValue({
      id: ID_V2,
      status: 'DRAFT',
      majorVersion: 2,
      version: 1,
      stages: [],
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/frameworks/${ID}/clone`)
      .expect(201);

    expect(res.body).toEqual({
      data: {
        id: ID_V2,
        status: 'DRAFT',
        majorVersion: 2,
        version: 1,
        stages: [],
      },
    });
    expect(res.headers.location).toBe(`/api/v1/frameworks/${ID_V2}`);
  });

  it('orden de etapas 422', async () => {
    service.get.mockResolvedValue({
      id: ID,
      status: 'DRAFT',
      version: 1,
      stages: [],
    });
    service.addStage.mockRejectedValue(
      new UnprocessableEntityException(
        'Stage sortOrder must be contiguous from 1 without gaps',
      ),
    );

    await request(app.getHttpServer())
      .post(`/api/v1/frameworks/${ID}/stages`)
      .send({ name: 'Gap', sortOrder: 3 })
      .expect(422);
  });

  it('create draft 201', async () => {
    service.create.mockResolvedValue({
      id: ID,
      name: 'FW',
      status: 'DRAFT',
      majorVersion: 1,
      stages: [],
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/frameworks')
      .send({
        name: 'FW',
        stages: [{ name: 'One', sortOrder: 1 }],
      })
      .expect(201);

    expect(res.body).toEqual({
      data: {
        id: ID,
        name: 'FW',
        status: 'DRAFT',
        majorVersion: 1,
        stages: [],
      },
    });
  });

  it('If-Match ausente 428', async () => {
    service.get.mockResolvedValue({ id: ID, status: 'DRAFT', version: 1 });
    service.update.mockRejectedValue(
      new HttpException('If-Match required', HttpStatus.PRECONDITION_REQUIRED),
    );

    // parseIfMatchVersion throws before service when header missing
    await request(app.getHttpServer())
      .patch(`/api/v1/frameworks/${ID}`)
      .send({ name: 'X' })
      .expect(428);
  });
});
