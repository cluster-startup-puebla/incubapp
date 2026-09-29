import { REQUIRED_ERROR_STATUSES } from './api-standard-errors.decorator.js';

export type OpenApiOperation = {
  summary?: string;
  responses?: Record<string, unknown>;
};

export type OpenApiPathItem = {
  get?: OpenApiOperation;
  put?: OpenApiOperation;
  post?: OpenApiOperation;
  delete?: OpenApiOperation;
  options?: OpenApiOperation;
  head?: OpenApiOperation;
  patch?: OpenApiOperation;
  trace?: OpenApiOperation;
};

export type OpenApiDocument = {
  openapi?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, OpenApiPathItem | undefined>;
};

export type OpenApiCheckFailure = {
  path: string;
  method: string;
  reason: string;
};

function isOperation(value: unknown): value is OpenApiOperation {
  return typeof value === 'object' && value !== null && 'responses' in value;
}

const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

/**
 * CI-friendly OpenAPI contract checks (T4.14).
 * Fails when paths escape /api/v1, include /api/auth, or miss required responses.
 */
export function assertOpenApiContract(doc: OpenApiDocument): void {
  const failures = collectOpenApiFailures(doc);
  if (failures.length > 0) {
    const lines = failures.map(
      (f) => `${f.method.toUpperCase()} ${f.path}: ${f.reason}`,
    );
    throw new Error(`OpenAPI contract failed:\n${lines.join('\n')}`);
  }
}

export function collectOpenApiFailures(
  doc: OpenApiDocument,
): OpenApiCheckFailure[] {
  const failures: OpenApiCheckFailure[] = [];
  const paths = doc.paths ?? {};

  for (const [path, item] of Object.entries(paths)) {
    if (path.startsWith('/api/auth') || path.includes('/api/auth')) {
      failures.push({
        path,
        method: '*',
        reason: 'must not document /api/auth',
      });
      continue;
    }

    if (!path.startsWith('/api/v1')) {
      failures.push({
        path,
        method: '*',
        reason: 'paths must be under /api/v1',
      });
      continue;
    }

    if (!item || typeof item !== 'object') {
      continue;
    }

    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (!isOperation(operation)) {
        continue;
      }

      if (!operation.summary || operation.summary.trim().length === 0) {
        failures.push({
          path,
          method,
          reason: 'missing summary',
        });
      }

      const responses = operation.responses ?? {};
      for (const status of REQUIRED_ERROR_STATUSES) {
        if (!(status in responses)) {
          failures.push({
            path,
            method,
            reason: `missing response ${status}`,
          });
        }
      }
    }
  }

  return failures;
}

/** Lightweight breaking-change check: removed paths or required response codes. */
export function diffOpenApiBreaking(
  previous: OpenApiDocument,
  next: OpenApiDocument,
): string[] {
  const issues: string[] = [];
  const prevPaths = previous.paths ?? {};
  const nextPaths = next.paths ?? {};

  for (const path of Object.keys(prevPaths)) {
    if (!(path in nextPaths)) {
      issues.push(`removed path ${path}`);
      continue;
    }

    for (const method of HTTP_METHODS) {
      const prevOp = prevPaths[path]?.[method];
      const nextOp = nextPaths[path]?.[method];
      if (!isOperation(prevOp)) {
        continue;
      }
      if (!isOperation(nextOp)) {
        issues.push(`removed operation ${method.toUpperCase()} ${path}`);
        continue;
      }

      for (const status of REQUIRED_ERROR_STATUSES) {
        if (
          prevOp.responses &&
          status in prevOp.responses &&
          !(status in (nextOp.responses ?? {}))
        ) {
          issues.push(
            `removed response ${status} on ${method.toUpperCase()} ${path}`,
          );
        }
      }
    }
  }

  return issues;
}
