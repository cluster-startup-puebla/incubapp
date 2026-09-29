import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  requestId: string;
  errors?: Array<{ path: string; message: string }>;
};

const PRISMA_STATUS: Record<string, number> = {
  P2002: HttpStatus.CONFLICT,
  P2025: HttpStatus.NOT_FOUND,
  P2003: HttpStatus.CONFLICT,
  P2034: HttpStatus.CONFLICT,
};

const STATUS_TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  410: 'Gone',
  422: 'Unprocessable Entity',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

export const REQUEST_ID_HEADER = 'x-request-id';

function resolveRequestId(req: Request): string {
  const raw = req.headers[REQUEST_ID_HEADER];
  const fromHeader = Array.isArray(raw) ? raw[0] : raw;
  if (typeof fromHeader === 'string' && fromHeader.trim().length > 0) {
    return fromHeader.trim();
  }
  return randomUUID();
}

function isApiV1(req: Request): boolean {
  const path = req.originalUrl ?? req.url ?? '';
  return path.startsWith('/api/v1');
}

function isAuthPath(req: Request): boolean {
  const path = req.originalUrl ?? req.url ?? '';
  return path.startsWith('/api/auth');
}

function prismaCode(exception: unknown): string | undefined {
  if (
    typeof exception === 'object' &&
    exception !== null &&
    'code' in exception &&
    typeof exception.code === 'string' &&
    'clientVersion' in exception
  ) {
    return (exception as { code: string }).code;
  }
  return undefined;
}

function extractErrors(
  response: string | object,
): Array<{ path: string; message: string }> | undefined {
  if (typeof response !== 'object' || response === null) {
    return undefined;
  }
  const errors = (response as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) {
    return undefined;
  }
  return errors
    .map((item) => {
      if (typeof item !== 'object' || item === null) {
        return null;
      }
      const path = (item as { path?: unknown }).path;
      const message = (item as { message?: unknown }).message;
      if (typeof path !== 'string' || typeof message !== 'string') {
        return null;
      }
      return { path, message };
    })
    .filter((item): item is { path: string; message: string } => item !== null);
}

function httpDetail(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if (typeof response === 'object' && response !== null) {
    const message = (response as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      return message.map(String).join('; ');
    }
  }
  return exception.message;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(
    private readonly nodeEnv: string = process.env.NODE_ENV ?? 'development',
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    if (isAuthPath(req) || !isApiV1(req)) {
      if (exception instanceof HttpException) {
        const status = exception.getStatus();
        const body = exception.getResponse();
        res.status(status).json(body);
        return;
      }
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
      return;
    }

    const requestId = resolveRequestId(req);
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const problem = this.toProblem(exception, req, requestId);
    res.status(problem.status).type('application/problem+json').json(problem);
  }

  toProblem(
    exception: unknown,
    req: Pick<Request, 'originalUrl' | 'url'>,
    requestId: string,
  ): ProblemDetails {
    const instance = req.originalUrl ?? req.url ?? '';
    const code = prismaCode(exception);

    if (code && PRISMA_STATUS[code] !== undefined) {
      const status = PRISMA_STATUS[code];
      return {
        type: `https://httpstatuses.com/${status}`,
        title: STATUS_TITLES[status] ?? 'Error',
        status,
        detail: `Database constraint (${code})`,
        instance,
        requestId,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const errors = extractErrors(response);
      return {
        type: `https://httpstatuses.com/${status}`,
        title: STATUS_TITLES[status] ?? 'Error',
        status,
        detail: this.safeDetail(status, httpDetail(exception)),
        instance,
        requestId,
        ...(errors && errors.length > 0 ? { errors } : {}),
      };
    }

    // Unhandled errors never echo the original message (may contain SQL/secrets).
    return {
      type: 'https://httpstatuses.com/500',
      title: STATUS_TITLES[500],
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'An unexpected error occurred',
      instance,
      requestId,
    };
  }

  private safeDetail(status: number, detail: string): string {
    if (status >= 500 && this.nodeEnv === 'production') {
      return 'An unexpected error occurred';
    }
    return detail;
  }
}
