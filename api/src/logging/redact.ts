const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'authorization',
  'cookie',
]);

export const REDACTED = '[Redacted]';

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-clones JSON-like values, replacing sensitive keys with a sentinel.
 * Keys matched case-insensitively: password, token, authorization, cookie.
 */
export function redact(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = redact(child);
  }
  return out;
}
