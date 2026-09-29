import {
  HttpStatus,
  UnprocessableEntityException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { IdempotencyGuard } from './idempotency.guard.js';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';
import {
  IDEMPOTENCY_HEADER,
  createMemoryIdempotencyStore,
  idempotencyStoreKey,
  type IdempotencyStore,
} from './idempotency.store.js';

function buildContext(
  request: Record<string, unknown>,
  response: {
    statusCode: number;
    status: (code: number) => void;
  },
): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function createResponse() {
  const state = { statusCode: 201 };
  return {
    get statusCode() {
      return state.statusCode;
    },
    status(code: number) {
      state.statusCode = code;
    },
  };
}

async function runOnce(
  interceptor: IdempotencyInterceptor,
  guard: IdempotencyGuard,
  request: Record<string, unknown>,
  insert: () => { id: string },
): Promise<{ body: unknown; statusCode: number }> {
  const response = createResponse();
  const context = buildContext(request, response);
  await guard.canActivate(context);

  const handler: CallHandler = {
    handle: () => of(insert()),
  };

  const body = await new Promise<unknown>((resolve, reject) => {
    interceptor.intercept(context, handler).subscribe({
      next: resolve,
      error: reject,
    });
  });

  return { body, statusCode: response.statusCode };
}

describe('Idempotency (guard + interceptor)', () => {
  let store: IdempotencyStore;
  let guard: IdempotencyGuard;
  let interceptor: IdempotencyInterceptor;
  let insertCount: number;

  beforeEach(() => {
    store = createMemoryIdempotencyStore();
    const reflector = {
      getAllAndOverride: () => true,
    } as unknown as Reflector;
    guard = new IdempotencyGuard(reflector, store);
    interceptor = new IdempotencyInterceptor(reflector, store);
    insertCount = 0;
  });

  function insert() {
    insertCount += 1;
    return { id: `row-${insertCount}`, name: 'created' };
  }

  it('misma key → un insert, misma respuesta', async () => {
    const key = 'key-same-body';
    const body = { name: 'Acme' };
    const request = {
      body,
      user: { id: 'user-1' },
      headers: { [IDEMPOTENCY_HEADER]: key },
    };

    const first = await runOnce(interceptor, guard, { ...request }, insert);
    const second = await runOnce(interceptor, guard, { ...request }, insert);

    expect(first.body).toEqual({ id: 'row-1', name: 'created' });
    expect(second.body).toEqual(first.body);
    expect(insertCount).toBe(1);
    expect(await store.get(idempotencyStoreKey('user-1', key))).not.toBeNull();
  });

  it('key y body distinto → 422 sin segundo insert', async () => {
    const key = 'key-conflict';
    const firstRequest = {
      body: { name: 'First' },
      user: { id: 'user-1' },
      headers: { [IDEMPOTENCY_HEADER]: key },
    };
    await runOnce(interceptor, guard, { ...firstRequest }, insert);
    expect(insertCount).toBe(1);

    const conflictRequest = {
      body: { name: 'Second' },
      user: { id: 'user-1' },
      headers: { [IDEMPOTENCY_HEADER]: key },
    };
    const response = createResponse();
    const context = buildContext(conflictRequest, response);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    try {
      await guard.canActivate(context);
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getStatus()).toBe(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    expect(insertCount).toBe(1);
  });

  it('key de otro user → no reutiliza respuesta ajena', async () => {
    const key = 'shared-key';
    const body = { name: 'Shared payload' };

    await runOnce(
      interceptor,
      guard,
      {
        body,
        user: { id: 'user-a' },
        headers: { [IDEMPOTENCY_HEADER]: key },
      },
      insert,
    );
    expect(insertCount).toBe(1);

    const other = await runOnce(
      interceptor,
      guard,
      {
        body,
        user: { id: 'user-b' },
        headers: { [IDEMPOTENCY_HEADER]: key },
      },
      insert,
    );

    expect(insertCount).toBe(2);
    expect(other.body).toEqual({ id: 'row-2', name: 'created' });
    expect(await store.get(idempotencyStoreKey('user-a', key))).not.toBeNull();
    expect(await store.get(idempotencyStoreKey('user-b', key))).not.toBeNull();
  });
});
