export type FieldError = { path: string; message: string };

export type ProblemBody = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors?: FieldError[];
  candidates?: unknown;
};

export class ProblemError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly type?: string;
  readonly title?: string;
  readonly instance?: string;
  readonly requestId?: string;
  readonly candidates?: unknown;
  readonly body?: ProblemBody;

  constructor(
    message: string,
    options: {
      status: number;
      detail?: string;
      type?: string;
      title?: string;
      instance?: string;
      requestId?: string;
      candidates?: unknown;
      body?: ProblemBody;
    },
  ) {
    super(message);
    this.name = 'ProblemError';
    this.status = options.status;
    this.detail = options.detail ?? message;
    this.type = options.type;
    this.title = options.title;
    this.instance = options.instance;
    this.requestId = options.requestId;
    this.candidates = options.candidates;
    this.body = options.body;
  }
}

export class UnauthorizedError extends ProblemError {
  constructor(detail = 'Unauthorized', body?: ProblemBody) {
    super(detail, { status: 401, detail, body, title: body?.title });
    this.name = 'UnauthorizedError';
  }
}

export class NotFoundError extends ProblemError {
  constructor(detail = 'Not Found', body?: ProblemBody) {
    super(detail, { status: 404, detail, body, title: body?.title });
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends ProblemError {
  readonly errors: FieldError[];

  constructor(
    detail = 'Unprocessable Entity',
    errors: FieldError[] = [],
    body?: ProblemBody,
  ) {
    super(detail, { status: 422, detail, body, title: body?.title });
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

type ApiClientInit = RequestInit & { incubatorId?: string | null };

function buildUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asProblemBody(value: unknown): ProblemBody | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return value as ProblemBody;
}

function fieldErrors(body: ProblemBody | undefined): FieldError[] {
  if (!body?.errors || !Array.isArray(body.errors)) {
    return [];
  }
  return body.errors.filter(
    (item): item is FieldError =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as FieldError).path === 'string' &&
      typeof (item as FieldError).message === 'string',
  );
}

function throwForStatus(status: number, body: ProblemBody | undefined): never {
  const detail =
    typeof body?.detail === 'string' && body.detail.length > 0
      ? body.detail
      : `Request failed with status ${status}`;

  if (status === 401) {
    throw new UnauthorizedError(detail, body);
  }
  if (status === 404) {
    throw new NotFoundError(detail, body);
  }
  if (status === 422) {
    throw new ValidationError(detail, fieldErrors(body), body);
  }
  throw new ProblemError(detail, {
    status,
    detail,
    type: body?.type,
    title: body?.title,
    instance: body?.instance,
    requestId: body?.requestId,
    candidates: body?.candidates,
    body,
  });
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProblemError('Invalid response body', {
      status: response.status || 500,
      detail: 'Invalid response body',
    });
  }
}

function unwrapSuccess<T>(body: unknown): T {
  if (isRecord(body) && 'data' in body) {
    if ('meta' in body) {
      return body as T;
    }
    return body.data as T;
  }
  return body as T;
}

export async function apiClient<T>(
  path: string,
  init?: ApiClientInit,
): Promise<T> {
  const { incubatorId, headers: initHeaders, ...rest } = init ?? {};
  const headers = new Headers(initHeaders);

  if (typeof incubatorId === 'string') {
    headers.set('x-incubator-id', incubatorId);
  }

  const response = await fetch(buildUrl(path), {
    ...rest,
    headers,
    credentials: 'include',
  });

  if (response.status === 204) {
    return undefined as T;
  }

  let body: unknown;
  try {
    body = await readBody(response);
  } catch (error) {
    if (error instanceof ProblemError) {
      throw error;
    }
    throw new ProblemError('Invalid response body', {
      status: response.status || 500,
      detail: 'Invalid response body',
    });
  }

  if (!response.ok) {
    throwForStatus(response.status, asProblemBody(body));
  }

  return unwrapSuccess<T>(body);
}
