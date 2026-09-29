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
import { GeoUnitsController } from './geo-units.controller.js';
import { GeoUnitsService } from './geo-units.service.js';
import { AuditLogInterceptor } from '../audit/audit-log.interceptor.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermissions } from '../authz/require-permissions.decorator.js';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';

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
const COUNTRY_ID = '01900000-0000-7000-8000-000000000001';

describe('GeoUnitsController (HTTP)', () => {
  let app: INestApplication;
  const service = {
    list: createMockFn(),
    listDeleted: createMockFn(),
    listChildren: createMockFn(),
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
      controllers: [GeoUnitsController],
      providers: [
        { provide: GeoUnitsService, useValue: service },
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

  it('hijos envelope', async () => {
    const states = [
      {
        id: '01900000-0000-7000-8000-000000000002',
        level: 'STATE',
        code: 'PUE',
        name: 'Puebla',
        parentId: COUNTRY_ID,
      },
    ];
    service.listChildren.mockResolvedValue({ items: states, total: 1 });
    const res = await request(app.getHttpServer())
      .get(`/api/v1/geo-units/${COUNTRY_ID}/children`)
      .expect(200);
    expect(res.body).toEqual({
      data: states,
      meta: { page: 1, pageSize: 20, total: 1 },
    });
  });

  it('create Location 201', async () => {
    const row = {
      id: ID,
      level: 'COUNTRY',
      code: 'CO',
      name: 'Colombia',
      parentId: null,
      version: 1,
    };
    service.create.mockResolvedValue(row);

    const res = await request(app.getHttpServer())
      .post('/api/v1/geo-units')
      .send({ level: 'COUNTRY', code: 'CO', name: 'Colombia' })
      .expect(201);

    expect(res.headers.location).toBe(`/api/v1/geo-units/${ID}`);
    expect(res.body).toEqual({ data: row });
  });

  it('nivel imposible 422', async () => {
    service.create.mockRejectedValue(
      new UnprocessableEntityException('MUNICIPALITY parent must be a STATE'),
    );
    await request(app.getHttpServer())
      .post('/api/v1/geo-units')
      .send({
        level: 'MUNICIPALITY',
        code: 'BAD',
        name: 'Bad',
        parentId: COUNTRY_ID,
      })
      .expect(422);
  });

  it('ciclo 422', async () => {
    service.get.mockResolvedValue({ id: ID, version: 1 });
    service.update.mockRejectedValue(
      new UnprocessableEntityException('Geo unit cannot be its own parent'),
    );
    await request(app.getHttpServer())
      .patch(`/api/v1/geo-units/${ID}`)
      .set('If-Match', '1')
      .send({ parentId: ID })
      .expect(422);
  });

  it('list envelope', async () => {
    service.list.mockResolvedValue({ items: [], total: 0 });
    const res = await request(app.getHttpServer())
      .get('/api/v1/geo-units')
      .expect(200);
    expect(res.body).toEqual({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
  });

  it('get 404', async () => {
    service.get.mockRejectedValue(new NotFoundException('Geo unit not found'));
    await request(app.getHttpServer())
      .get(`/api/v1/geo-units/${ID}`)
      .expect(404);
  });

  it('patch sin If-Match 428', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/geo-units/${ID}`)
      .send({ name: 'X' })
      .expect(428);
  });

  it('delete 204', async () => {
    service.get.mockResolvedValue({ id: ID });
    service.remove.mockResolvedValue({ id: ID });
    await request(app.getHttpServer())
      .delete(`/api/v1/geo-units/${ID}`)
      .expect(204);
  });

  it('delete with children 409', async () => {
    service.get.mockResolvedValue({ id: ID });
    service.remove.mockRejectedValue(
      new ConflictException('Geo unit has active children'),
    );
    await request(app.getHttpServer())
      .delete(`/api/v1/geo-units/${ID}`)
      .expect(409);
  });

  it('rate limit shape 429 Retry-After', () => {
    const filter = new ProblemDetailsFilter('test');
    const problem = filter.toProblem(
      new HttpException(
        'Write rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      ),
      { originalUrl: '/api/v1/geo-units', url: '/api/v1/geo-units' },
      'req',
    );
    expect(problem.status).toBe(429);
  });
});

describe('GeoUnits write permissions (guard)', () => {
  it('write no admin 403', () => {
    class Fixture {
      @RequirePermissions('geo-unit:create')
      handler(this: void) {
        return true;
      }
    }
    const reflector = new Reflector();
    const guard = new PermissionsGuard(reflector);
    const handler = Fixture.prototype.handler;
    const context = {
      getHandler: () => handler,
      getClass: () => Fixture,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'u1', isSuperAdmin: false },
          membershipRoles: ['director'],
        }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('read autenticado no admin', () => {
    class Fixture {
      @RequirePermissions('geo-unit:read')
      handler(this: void) {
        return true;
      }
    }
    const reflector = new Reflector();
    const guard = new PermissionsGuard(reflector);
    const handler = Fixture.prototype.handler;
    const context = {
      getHandler: () => handler,
      getClass: () => Fixture,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'u1', isSuperAdmin: false },
          membershipRoles: ['director'],
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });
});
