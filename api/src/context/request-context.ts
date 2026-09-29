import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContextStore = {
  userId: string | null;
  /** Active tenant; null means global / unscoped. */
  incubatorId: string | null;
  isSuperAdmin: boolean;
  /** Authenticated actor (same as userId when present). */
  actorId: string | null;
};

const requestContextStorage = new AsyncLocalStorage<RequestContextStore>();

/** Prefer async callbacks so Prisma extension hooks see ALS. */
export function runWithRequestContext<T>(
  store: RequestContextStore,
  fn: () => T,
): T {
  return requestContextStorage.run(store, fn);
}

/** Back-compat helper used by soft-delete audit and older specs. */
export function runWithUser<T>(userId: string | null, fn: () => T): T {
  return runWithRequestContext(
    {
      userId,
      incubatorId: null,
      isSuperAdmin: false,
      actorId: userId,
    },
    fn,
  );
}

export function currentUserId(): string | null {
  return requestContextStorage.getStore()?.userId ?? null;
}

export function currentIncubatorId(): string | null {
  return requestContextStorage.getStore()?.incubatorId ?? null;
}

export function currentIsSuperAdmin(): boolean {
  return requestContextStorage.getStore()?.isSuperAdmin ?? false;
}

export function currentActorId(): string | null {
  const store = requestContextStorage.getStore();
  return store?.actorId ?? store?.userId ?? null;
}

export function getRequestContext(): RequestContextStore | undefined {
  return requestContextStorage.getStore();
}
