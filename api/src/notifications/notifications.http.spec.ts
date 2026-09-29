import {
  INestApplication,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { EnvelopeInterceptor } from '../common/http/envelope.interceptor.js';
import { ProblemDetailsFilter } from '../common/http/problem-details.filter.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

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
    rejected = undefined;
  };
  return fn;
}

const ID = '01900000-0000-7000-8000-000000000099';

describe('NotificationsController (HTTP)', () => {
  let app: INestApplication;
  const service = {
    list: createMockFn(),
    get: createMockFn(),
    markRead: createMockFn(),
    create: createMockFn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: service },
        EnvelopeInterceptor,
        {
          provide: APP_PIPE,
          useClass: ZodValidationPipe,
        },
      ],
    }).compile();

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
    service.list.calls.length = 0;
    service.get.calls.length = 0;
    service.markRead.calls.length = 0;
  });

  it('GET list envelope', async () => {
    service.list.mockResolvedValue({
      items: [{ id: ID, title: 'Hola', readAt: null }],
      total: 1,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .expect(200);

    expect(res.body).toMatchObject({
      data: [{ id: ID, title: 'Hola' }],
      meta: { page: 1, pageSize: 20, total: 1 },
    });
  });

  it('POST read 200 envelope', async () => {
    const readAt = '2026-09-29T12:00:00.000Z';
    service.markRead.mockResolvedValue({
      id: ID,
      title: 'Hola',
      readAt,
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/notifications/${ID}/read`)
      .expect(200);

    expect(res.body).toMatchObject({
      data: { id: ID, readAt },
    });
    expect(service.markRead.calls[0][0]).toBe(ID);
  });

  it('POST read ajena 404', async () => {
    service.markRead.mockRejectedValue(
      new NotFoundException('Notification not found'),
    );

    const res = await request(app.getHttpServer())
      .post(`/api/v1/notifications/${ID}/read`)
      .expect(404);

    const body = res.body as { status: number; title: string };
    expect(body.status).toBe(404);
    expect(typeof body.title).toBe('string');
  });

  it('GET sin auth propaga 401', async () => {
    service.get.mockRejectedValue(
      new UnauthorizedException('Authentication required'),
    );

    await request(app.getHttpServer())
      .get(`/api/v1/notifications/${ID}`)
      .expect(401);
  });
});
