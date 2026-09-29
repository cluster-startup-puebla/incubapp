const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'secret',
  'authorization',
  'cookie',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-clones JSON-like values while dropping secret keys. */
export function sanitizeAuditPayload(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditPayload(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) {
      continue;
    }
    out[key] = sanitizeAuditPayload(child);
  }
  return out;
}

export type AuditDiff = {
  before: unknown;
  after: unknown;
};

export function buildAuditDiff(before: unknown, after: unknown): AuditDiff {
  return {
    before: sanitizeAuditPayload(before),
    after: sanitizeAuditPayload(after),
  };
}
