import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import {
  isHealthPath,
  isWriteMethod,
  WriteRateLimiter,
} from './write-rate-limit.js';

type RequestLike = {
  method?: string;
  originalUrl?: string;
  url?: string;
  path?: string;
  user?: { id?: string } | null;
  res?: { setHeader: (name: string, value: string | number) => void };
};

/**
 * Limits authenticated writes to 30/min per user.
 * Health and non-writes are skipped. Redis failures fail open.
 */
@Injectable()
export class WriteRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: WriteRateLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestLike>();
    const response = http.getResponse<{
      setHeader: (name: string, value: string | number) => void;
    }>();

    const path = request.originalUrl ?? request.url ?? request.path ?? '';
    if (isHealthPath(path) || !isWriteMethod(request.method)) {
      return true;
    }

    const userId = request.user?.id;
    if (!userId) {
      // Auth guard runs first; unauthenticated writes still skip bucket.
      return true;
    }

    const decision = await this.limiter.consume(userId);
    if (!decision.allowed) {
      response.setHeader('Retry-After', decision.retryAfterSeconds);
      throw new HttpException(
        'Write rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
