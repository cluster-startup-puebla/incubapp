import { Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { subscribeSlowQueryLog } from './prisma.client.js';

type MockFn = ((...args: unknown[]) => Promise<unknown>) & {
  calls: unknown[][];
};

function createMockFn(impl?: (...args: unknown[]) => Promise<unknown>): MockFn {
  const fn = ((...args: unknown[]) => {
    fn.calls.push(args);
    return impl ? impl(...args) : Promise.resolve(undefined);
  }) as MockFn;
  fn.calls = [];
  return fn;
}

describe('PrismaService', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('conecta', async () => {
    const $connect = createMockFn(() => Promise.resolve());
    const $disconnect = createMockFn(() => Promise.resolve());
    const service = new PrismaService();
    Object.assign(service, {
      client: { $connect, $disconnect },
    });

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect($connect.calls).toHaveLength(1);
  });

  it('desconecta', async () => {
    const $connect = createMockFn(() => Promise.resolve());
    const $disconnect = createMockFn(() => Promise.resolve());
    const service = new PrismaService();
    Object.assign(service, {
      client: { $connect, $disconnect },
    });

    await service.onModuleDestroy();
    expect($disconnect.calls).toHaveLength(1);
  });

  it('db caida', async () => {
    const $connect = createMockFn(() =>
      Promise.reject(new Error('ECONNREFUSED 5433')),
    );
    const service = new PrismaService();
    Object.assign(service, {
      client: { $connect, $disconnect: createMockFn() },
    });

    await expect(service.onModuleInit()).rejects.toThrow(/Postgres/);
  });

  it('query lenta', () => {
    process.env.NODE_ENV = 'development';
    const warnings: string[] = [];
    const logger = {
      warn: (message: string) => {
        warnings.push(message);
      },
    } as unknown as Logger;

    let listener:
      ((event: { query: string; duration: number }) => void) | undefined;

    const fakeClient = {
      $on: (
        event: string,
        cb: (e: { query: string; duration: number }) => void,
      ) => {
        if (event === 'query') {
          listener = cb;
        }
      },
    };

    subscribeSlowQueryLog(fakeClient as never, logger, 500);

    expect(listener).toBeDefined();
    listener!({ query: 'SELECT 1', duration: 120 });
    expect(warnings).toHaveLength(0);

    listener!({ query: 'SELECT * FROM institution', duration: 501 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Slow query \(501ms\)/);
  });
});
