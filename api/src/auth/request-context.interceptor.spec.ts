import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, firstValueFrom } from 'rxjs';
import { resolveCurrentUser } from './current-user.decorator.js';
import { RequestContextInterceptor } from './request-context.interceptor.js';
import {
  currentIncubatorId,
  currentUserId,
} from '../context/request-context.js';
import type { Membership } from '../generated/prisma/client.js';
import type { MembershipService } from '../membership/membership.service.js';

function createMemberships(
  listActive: (userId?: string) => Promise<Membership[]>,
): MembershipService {
  return { listActive } as MembershipService;
}

describe('CurrentUser + RequestContextInterceptor', () => {
  it('usuario correcto', async () => {
    const interceptor = new RequestContextInterceptor(
      createMemberships(() =>
        Promise.resolve([
          {
            id: 'm1',
            userId: 'user-a',
            scopeType: 'incubator',
            scopeId: '11111111-1111-7111-8111-111111111111',
            role: 'director',
            validFrom: new Date(0),
            validTo: null,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdById: null,
            updatedById: null,
            deletedById: null,
            version: 1,
          },
        ]),
      ),
    );
    const request = {
      user: { id: 'user-a', email: 'a@example.com' },
      headers: {},
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const handler: CallHandler = {
      handle: () =>
        of({
          seen: currentUserId(),
          incubator: currentIncubatorId(),
        }),
    };

    const result = await firstValueFrom(
      await interceptor.intercept(context, handler),
    );
    expect(result).toEqual({
      seen: 'user-a',
      incubator: '11111111-1111-7111-8111-111111111111',
    });
    expect(resolveCurrentUser(request)?.id).toBe('user-a');
  });

  it('ruta publica', async () => {
    const interceptor = new RequestContextInterceptor(
      createMemberships(() => Promise.resolve([])),
    );
    const request = { user: null, headers: {} };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const handler: CallHandler = {
      handle: () =>
        of({
          seen: currentUserId(),
        }),
    };

    const result = await firstValueFrom(
      await interceptor.intercept(context, handler),
    );
    expect(result).toEqual({ seen: null });
    expect(resolveCurrentUser(request)).toBeUndefined();
  });

  it('als aislado', async () => {
    const interceptor = new RequestContextInterceptor(
      createMemberships((userId) =>
        Promise.resolve([
          {
            id: `m-${userId}`,
            userId: userId ?? 'x',
            scopeType: 'incubator',
            scopeId:
              userId === 'user-1'
                ? '11111111-1111-7111-8111-111111111111'
                : '22222222-2222-7222-8222-222222222222',
            role: 'director',
            validFrom: new Date(0),
            validTo: null,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdById: null,
            updatedById: null,
            deletedById: null,
            version: 1,
          },
        ]),
      ),
    );

    const run = async (userId: string) => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: userId }, headers: {} }),
        }),
      } as unknown as ExecutionContext;
      const handler: CallHandler = {
        handle: () =>
          of({
            seen: currentUserId(),
          }),
      };
      return firstValueFrom(await interceptor.intercept(context, handler));
    };

    const [a, b] = await Promise.all([run('user-1'), run('user-2')]);
    expect(a).toEqual({ seen: 'user-1' });
    expect(b).toEqual({ seen: 'user-2' });
  });

  it('sesion sin membresia no exige tenant', async () => {
    const interceptor = new RequestContextInterceptor(
      createMemberships(() => Promise.resolve([])),
    );
    const request = { user: { id: 'user-a' }, headers: {} };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = {
      handle: () => of({ seen: currentUserId() }),
    };

    const result = await firstValueFrom(
      await interceptor.intercept(context, handler),
    );
    expect(result).toEqual({ seen: 'user-a' });
  });
});
