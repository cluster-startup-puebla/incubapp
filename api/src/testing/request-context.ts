import { AsyncLocalStorage } from 'node:async_hooks';

type RequestContextStore = {
  userId: string | null;
};

const requestContextStorage = new AsyncLocalStorage<RequestContextStore>();

export function runWithUser<T>(userId: string | null, fn: () => T): T {
  return requestContextStorage.run({ userId }, fn);
}

export function currentUserId(): string | null {
  return requestContextStorage.getStore()?.userId ?? null;
}
