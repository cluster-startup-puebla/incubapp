import { REDACTED, redact } from './redact.js';
import { buildRequestLogLine } from './request-log.js';

const CANARY = 'super-secret-value';

describe('request logging', () => {
  it('linea json', () => {
    const line = buildRequestLogLine({
      requestId: 'req-fake-1',
      userId: 'user-1',
      tenantId: 'incubator-1',
      durationMs: 12,
      method: 'POST',
      path: '/api/v1/startups',
      statusCode: 201,
      body: { name: 'Acme' },
    });

    expect(line).toEqual(
      expect.objectContaining({
        requestId: 'req-fake-1',
        userId: 'user-1',
        tenantId: 'incubator-1',
        durationMs: 12,
      }),
    );
    expect(typeof line.requestId).toBe('string');
    expect(typeof line.durationMs).toBe('number');
  });

  it('redacta', () => {
    const line = buildRequestLogLine({
      requestId: 'req-fake-2',
      userId: null,
      tenantId: null,
      durationMs: 5,
      headers: {
        cookie: `session=${CANARY}`,
        authorization: `Bearer ${CANARY}`,
        'content-type': 'application/json',
      },
      body: {
        email: 'a@b.co',
        password: CANARY,
        token: CANARY,
      },
    });

    expect(line.headers).toEqual({
      cookie: REDACTED,
      authorization: REDACTED,
      'content-type': 'application/json',
    });
    expect(line.body).toEqual({
      email: 'a@b.co',
      password: REDACTED,
      token: REDACTED,
    });

    const logged = JSON.stringify(line);
    expect(logged).not.toContain(CANARY);

    const redactedAlone = redact({
      Authorization: `Bearer ${CANARY}`,
      nested: { Password: CANARY, ok: true },
    });
    expect(JSON.stringify(redactedAlone)).not.toContain(CANARY);
    expect(redactedAlone).toEqual({
      Authorization: REDACTED,
      nested: { Password: REDACTED, ok: true },
    });
  });
});
