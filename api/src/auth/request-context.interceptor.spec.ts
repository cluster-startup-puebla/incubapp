import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, firstValueFrom } from 'rxjs';
import { resolveCurrentUser } from './current-user.decorator.js';
import { RequestContextInterceptor } from './request-context.interceptor.js';
import { currentUserId } from '../context/request-context.js';

describe('CurrentUser + RequestContextInterceptor', () => {
  it('usuario correcto', async () => {
    const interceptor = new RequestContextInterceptor();
    const request = { user: { id: 'user-a', email: 'a@example.com' } };
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
      interceptor.intercept(context, handler),
    );
    expect(result).toEqual({ seen: 'user-a' });
    expect(resolveCurrentUser(request)?.id).toBe('user-a');
  });

  it('ruta publica', async () => {
    const interceptor = new RequestContextInterceptor();
    const request = { user: null };
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
      interceptor.intercept(context, handler),
    );
    expect(result).toEqual({ seen: null });
    expect(resolveCurrentUser(request)).toBeUndefined();
  });

  it('als aislado', async () => {
    const interceptor = new RequestContextInterceptor();

    const run = async (userId: string) => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: userId } }),
        }),
      } as unknown as ExecutionContext;
      const handler: CallHandler = {
        handle: () =>
          of({
            seen: currentUserId(),
          }),
      };
      return firstValueFrom(interceptor.intercept(context, handler));
    };

    const [a, b] = await Promise.all([run('user-1'), run('user-2')]);
    expect(a).toEqual({ seen: 'user-1' });
    expect(b).toEqual({ seen: 'user-2' });
  });
});
