import { ConflictException, NotFoundException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AuditLogInterceptor } from './audit-log.interceptor.js';
import type { AuditLogService } from './audit-log.service.js';
import { Reflector } from '@nestjs/core';
import type { CallHandler, ExecutionContext } from '@nestjs/common';

function createMockFn<Args extends unknown[] = unknown[], Result = unknown>() {
  let resolved: Result | undefined;
  let rejected: unknown;
  const calls: Args[] = [];
  const fn = ((...args: Args) => {
    calls.push(args);
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
  };
  fn.calls = calls;
  fn.mockResolvedValue = (value: Result) => {
    resolved = value;
    rejected = undefined;
  };
  fn.mockRejectedValue = (error: unknown) => {
    rejected = error;
  };
  return fn;
}

describe('AuditLogInterceptor', () => {
  function build(
    resource: string | undefined,
    request: Record<string, unknown>,
  ) {
    const record = createMockFn<
      [
        {
          actorId: string | null;
          action: string;
          resource: string;
          resourceId: string | null;
          before: unknown;
          after: unknown;
          requestId: string | null;
        },
      ],
      void
    >();
    record.mockResolvedValue(undefined);

    const reflector = {
      getAllAndOverride: () => resource,
    } as unknown as Reflector;

    const audit = {
      record,
    } as unknown as AuditLogService;

    const interceptor = new AuditLogInterceptor(reflector, audit);
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    return { interceptor, context, record };
  }

  it('patch', async () => {
    const { interceptor, context, record } = build('institution', {
      method: 'PATCH',
      originalUrl: '/api/v1/institutions/id-1',
      params: { id: 'id-1' },
      user: { id: 'actor-1' },
      headers: { 'x-request-id': 'req-1' },
      auditBefore: { name: 'Old', password: 'secret' },
    });

    const handler: CallHandler = {
      handle: () => of({ data: { id: 'id-1', name: 'New' } }),
    };

    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(context, handler).subscribe({
        next: () => resolve(),
        error: reject,
      });
    });

    expect(record.calls).toHaveLength(1);
    const payload = record.calls[0][0];
    expect(payload.action).toBe('update');
    expect(payload.resource).toBe('institution');
    expect(payload.resourceId).toBe('id-1');
    expect(payload.before).toEqual({ name: 'Old', password: 'secret' });
    // sanitize happens inside AuditLogService.record via buildAuditDiff;
    // interceptor passes raw before — service strips secrets.
  });

  it('fallo', async () => {
    const { interceptor, context, record } = build('institution', {
      method: 'POST',
      originalUrl: '/api/v1/institutions',
      user: { id: 'actor-1' },
      headers: {},
    });

    const handler: CallHandler = {
      handle: () => throwError(() => new ConflictException('boom')),
    };

    await expect(
      new Promise<void>((resolve, reject) => {
        interceptor.intercept(context, handler).subscribe({
          next: () => resolve(),
          error: reject,
        });
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(record.calls).toHaveLength(0);
  });

  it('sin resource metadata no escribe', async () => {
    const { interceptor, context, record } = build(undefined, {
      method: 'POST',
      originalUrl: '/api/v1/institutions',
      user: { id: 'actor-1' },
      headers: {},
    });

    const handler: CallHandler = {
      handle: () => of({ id: 'x' }),
    };

    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(context, handler).subscribe({
        next: () => resolve(),
        error: reject,
      });
    });

    expect(record.calls).toHaveLength(0);
  });

  it('not found tampoco escribe', async () => {
    const { interceptor, context, record } = build('institution', {
      method: 'DELETE',
      originalUrl: '/api/v1/institutions/missing',
      params: { id: 'missing' },
      user: { id: 'actor-1' },
      headers: {},
    });

    const handler: CallHandler = {
      handle: () => throwError(() => new NotFoundException()),
    };

    await expect(
      new Promise<void>((resolve, reject) => {
        interceptor.intercept(context, handler).subscribe({
          next: () => resolve(),
          error: reject,
        });
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(record.calls).toHaveLength(0);
  });
});
