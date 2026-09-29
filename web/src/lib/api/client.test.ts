import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedError, apiClient, ProblemError } from './client';

describe('apiClient', () => {
  const originalFetch = globalThis.fetch;
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'http://api.test';
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    vi.restoreAllMocks();
  });

  function mockResponse(
    status: number,
    body: string | null,
    headers?: Record<string, string>,
  ) {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(body, {
        status,
        headers: {
          'content-type': 'application/json',
          ...headers,
        },
      }),
    );
  }

  it('unwraps { data } without meta', async () => {
    mockResponse(200, JSON.stringify({ data: { id: '1', name: 'Acme' } }));

    const result = await apiClient<{ id: string; name: string }>(
      '/api/v1/startups/1',
    );

    expect(result).toEqual({ id: '1', name: 'Acme' });
  });

  it('keeps the list envelope when meta is present', async () => {
    const envelope = {
      data: [{ id: '1' }],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    mockResponse(200, JSON.stringify(envelope));

    const result = await apiClient<typeof envelope>('/api/v1/startups');

    expect(result).toEqual(envelope);
  });

  it('omits x-incubator-id when incubatorId is null', async () => {
    mockResponse(200, JSON.stringify({ data: [] }));

    await apiClient('/api/v1/analytics/overview', { incubatorId: null });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.has('x-incubator-id')).toBe(false);
    expect(init?.credentials).toBe('include');
  });

  it('sends x-incubator-id when incubatorId is set', async () => {
    mockResponse(200, JSON.stringify({ data: {} }));

    await apiClient('/api/v1/analytics/overview', {
      incubatorId: 'inc-123',
    });

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('x-incubator-id')).toBe('inc-123');
  });

  it('throws UnauthorizedError on 401', async () => {
    mockResponse(
      401,
      JSON.stringify({
        type: 'https://httpstatuses.com/401',
        title: 'Unauthorized',
        status: 401,
        detail: 'Session expired',
      }),
    );

    await expect(apiClient('/api/v1/startups')).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('HTML body becomes ProblemError without a JSON parse crash', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response('<html>Bad Gateway</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const error = await apiClient('/api/v1/startups').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProblemError);
    expect(error).not.toBeInstanceOf(SyntaxError);
  });
});
