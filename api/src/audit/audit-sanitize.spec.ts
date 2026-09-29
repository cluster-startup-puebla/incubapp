import { buildAuditDiff, sanitizeAuditPayload } from './audit-sanitize.js';

describe('audit sanitize', () => {
  it('sensible', () => {
    const sanitized = sanitizeAuditPayload({
      name: 'Tec',
      password: 'super-secret-value',
      nested: { token: 'abc', ok: 1 },
    });
    expect(sanitized).toEqual({
      name: 'Tec',
      nested: { ok: 1 },
    });
    expect(JSON.stringify(sanitized)).not.toContain('super-secret-value');
  });

  it('diff', () => {
    const diff = buildAuditDiff(
      { name: 'A', password: 'x' },
      { name: 'B', password: 'y' },
    );
    expect(diff.before).toEqual({ name: 'A' });
    expect(diff.after).toEqual({ name: 'B' });
  });
});
