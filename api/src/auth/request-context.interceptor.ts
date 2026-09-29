import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, type Subscription } from 'rxjs';
import { runWithUser } from '../context/request-context.js';

type RequestWithUser = {
  user?: { id?: string } | null;
};

/**
 * Populates the shared T1.6 AsyncLocalStorage after AuthGuard attaches the user.
 * Reuses `runWithUser` / `currentUserId` — no second ALS.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = request.user?.id ?? null;

    return new Observable((subscriber) => {
      let subscription: Subscription | undefined;
      runWithUser(userId, () => {
        subscription = next.handle().subscribe(subscriber);
      });
      return () => {
        subscription?.unsubscribe();
      };
    });
  }
}
