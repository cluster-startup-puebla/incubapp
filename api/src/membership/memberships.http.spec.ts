import {
  ConflictException,
  GoneException,
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
import { MembershipsController } from './memberships.controller.js';
import { MembershipsHttpService } from './memberships-http.service.js';
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

const MEM_ID = '01900000-0000-7000-8000-000000000099';
const INV_ID = '01900000-0000-7000-8000-000000000088';
const SCOPE = '01900000-0000-7000-8000-0000000000aa';

describe('MembershipsController (HTTP)', () => {
  let app: INestApplication;
  const service = {
    list: createMockFn(),
    get: createMockFn(),
    invite: createMockFn(),
    acceptInvitation: createMockFn(),
    remove: createMockFn(),
  };
  const auditRecord = createMockFn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MembershipsController],
      providers: [
        { provide: MembershipsHttpService, useValue: service },
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
    app.useGlobalInterceptors(app.get(EnvelopeInterceptor));
    app.useGlobalFilters(new ProblemDetailsFilter('test'));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    service.list.calls.length = 0;
    service.get.calls.length = 0;
    service.invite.calls.length = 0;
    service.acceptInvitation.calls.length = 0;
    service.remove.calls.length = 0;
  });

  it('POST invite 201 envelope', async () => {
    const payload = {
      user: { id: 'u1', email: 'a@example.com', name: 'A' },
      membership: { id: MEM_ID, role: 'mentor', scopeId: SCOPE },
      invitation: { id: INV_ID, email: 'a@example.com' },
      invitationToken: 'tok-plain',
      createdUser: true,
    };
    service.invite.mockResolvedValue(payload);

    const res = await request(app.getHttpServer())
      .post('/api/v1/memberships/invite')
      .send({
        email: 'a@example.com',
        role: 'mentor',
        scopeType: 'incubator',
        scopeId: SCOPE,
      })
      .expect(201);

    expect(res.headers.location).toBe(`/api/v1/memberships/${MEM_ID}`);
    expect(res.body).toEqual({ data: payload });
  });

  it('POST invite email invalido 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/memberships/invite')
      .send({
        email: 'bad',
        role: 'mentor',
        scopeType: 'incubator',
        scopeId: SCOPE,
      })
      .expect(400);
  });

  it('POST accept 410', async () => {
    service.acceptInvitation.mockRejectedValue(
      new GoneException('Invitation has expired'),
    );
    const res = await request(app.getHttpServer())
      .post(`/api/v1/memberships/invitations/${INV_ID}/accept`)
      .send({ token: 'any' })
      .expect(410);
    expect((res.body as { status: number }).status).toBe(410);
  });

  it('DELETE ultimo director 409', async () => {
    service.get.mockResolvedValue({ id: MEM_ID, role: 'director' });
    service.remove.mockRejectedValue(
      new ConflictException('Cannot remove the last active director'),
    );
    await request(app.getHttpServer())
      .delete(`/api/v1/memberships/${MEM_ID}`)
      .expect(409);
  });

  it('GET missing 404 problem+json', async () => {
    service.get.mockRejectedValue(
      new NotFoundException('Membership not found'),
    );
    const res = await request(app.getHttpServer())
      .get(`/api/v1/memberships/${MEM_ID}`)
      .expect(404);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect((res.body as { status: number }).status).toBe(404);
  });

  it('list envelope', async () => {
    const items = [{ id: MEM_ID, role: 'staff' }];
    service.list.mockResolvedValue({
      items,
      total: 1,
    });
    const res = await request(app.getHttpServer())
      .get('/api/v1/memberships')
      .expect(200);
    expect(res.body).toEqual({
      data: items,
      meta: { page: 1, pageSize: 20, total: 1 },
    });
  });

  it('escalada 403 via service', async () => {
    service.invite.mockRejectedValue(
      new HttpException(
        'Directors cannot assign cluster_admin',
        HttpStatus.FORBIDDEN,
      ),
    );
    await request(app.getHttpServer())
      .post('/api/v1/memberships/invite')
      .send({
        email: 'x@example.com',
        role: 'cluster_admin',
        scopeType: 'incubator',
        scopeId: SCOPE,
      })
      .expect(403);
  });
});
