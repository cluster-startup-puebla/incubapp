import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ProblemDetailsFilter,
  REQUEST_ID_HEADER,
} from './problem-details.filter.js';

function createPrismaError(code: string, message: string) {
  return Object.assign(new Error(message), {
    code,
    clientVersion: 'test',
    meta: {},
  });
}

function createHost(options: {
  url?: string;
  headers?: Record<string, string | undefined>;
}) {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let contentType: string | undefined;
  let body: unknown;

  const req = {
    originalUrl: options.url ?? '/api/v1/startups',
    url: options.url ?? '/api/v1/startups',
    headers: {
      [REQUEST_ID_HEADER]: options.headers?.[REQUEST_ID_HEADER],
    },
  } as unknown as Request;

  type ResMock = {
    status(code: number): ResMock;
    type(value: string): ResMock;
    setHeader(name: string, value: string): ResMock;
    json(payload: unknown): ResMock;
  };

  const res: ResMock = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    type(value: string) {
      contentType = value;
      return res;
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return res;
    },
    json(payload: unknown) {
      body = payload;
      return res;
    },
  };

  const host = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res as unknown as Response,
    }),
  };

  return {
    host: host as never,
    get result() {
      return { statusCode, contentType, body, headers };
    },
  };
}

describe('ProblemDetailsFilter', () => {
  it('404', () => {
    const filter = new ProblemDetailsFilter('test');
    const ctx = createHost({});
    filter.catch(new NotFoundException('Startup not found'), ctx.host);

    expect(ctx.result.statusCode).toBe(404);
    expect(ctx.result.contentType).toBe('application/problem+json');
    expect(ctx.result.body).toMatchObject({
      type: 'https://httpstatuses.com/404',
      title: 'Not Found',
      status: 404,
      detail: 'Startup not found',
      instance: '/api/v1/startups',
    });
    expect(typeof (ctx.result.body as { requestId: string }).requestId).toBe(
      'string',
    );
  });

  it('P2002', () => {
    const filter = new ProblemDetailsFilter('test');
    const ctx = createHost({});
    filter.catch(createPrismaError('P2002', 'Unique constraint'), ctx.host);
    expect(ctx.result.statusCode).toBe(409);
    expect(ctx.result.body).toMatchObject({ status: 409, title: 'Conflict' });
  });

  it('P2025', () => {
    const filter = new ProblemDetailsFilter('test');
    const ctx = createHost({});
    filter.catch(createPrismaError('P2025', 'Record not found'), ctx.host);
    expect(ctx.result.statusCode).toBe(404);
  });

  it('no controlado', () => {
    const filter = new ProblemDetailsFilter('test');
    const ctx = createHost({});
    filter.catch(new Error('sql secret SELECT * FROM prisma'), ctx.host);

    expect(ctx.result.statusCode).toBe(500);
    const serialized = JSON.stringify(ctx.result.body);
    expect(serialized).not.toMatch(/secret/i);
    expect(serialized).not.toMatch(/select/i);
    expect(serialized).not.toMatch(/prisma/i);
    expect(serialized).not.toMatch(/stack/i);
    expect(ctx.result.body).not.toHaveProperty('stack');
  });

  it('requestId', () => {
    const filter = new ProblemDetailsFilter('test');
    const ctx = createHost({
      headers: { [REQUEST_ID_HEADER]: undefined },
    });
    filter.catch(new NotFoundException('missing'), ctx.host);
    const requestId = (ctx.result.body as { requestId: string }).requestId;
    expect(requestId.length).toBeGreaterThan(0);
    expect(ctx.result.headers[REQUEST_ID_HEADER]).toBe(requestId);
  });

  it('prod', () => {
    const filter = new ProblemDetailsFilter('production');
    const ctx = createHost({});
    filter.catch(new Error('sql secret SELECT prisma stack'), ctx.host);

    expect(ctx.result.statusCode).toBe(500);
    expect(ctx.result.body).toMatchObject({
      status: 500,
      detail: 'An unexpected error occurred',
    });
    const serialized = JSON.stringify(ctx.result.body);
    expect(serialized).not.toMatch(/secret/i);
    expect(serialized).not.toMatch(/select/i);
    expect(serialized).not.toMatch(/prisma/i);
    expect(serialized).not.toMatch(/stack/i);
  });

  it('P2003 y P2034 son 409', () => {
    const filter = new ProblemDetailsFilter('test');
    for (const code of ['P2003', 'P2034']) {
      const ctx = createHost({});
      filter.catch(createPrismaError(code, 'constraint'), ctx.host);
      expect(ctx.result.statusCode).toBe(409);
    }
  });

  it('HttpException 400 conserva errors', () => {
    const filter = new ProblemDetailsFilter('test');
    const ctx = createHost({});
    filter.catch(
      new HttpException(
        {
          message: 'Validation failed',
          errors: [{ path: 'name', message: 'Required' }],
        },
        HttpStatus.BAD_REQUEST,
      ),
      ctx.host,
    );
    expect(ctx.result.body).toMatchObject({
      status: 400,
      errors: [{ path: 'name', message: 'Required' }],
    });
  });

  it('409 domain collision incluye candidates', () => {
    const filter = new ProblemDetailsFilter('test');
    const ctx = createHost({});
    filter.catch(
      new HttpException(
        {
          message: 'Similar startups exist for this domain',
          candidates: [{ id: 's1', name: 'Acme', domain: 'acme.com' }],
        },
        HttpStatus.CONFLICT,
      ),
      ctx.host,
    );
    expect(ctx.result.body).toMatchObject({
      status: 409,
      detail: 'Similar startups exist for this domain',
      candidates: [{ id: 's1', name: 'Acme', domain: 'acme.com' }],
    });
  });
});
