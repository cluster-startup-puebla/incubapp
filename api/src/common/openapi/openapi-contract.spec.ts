import {
  assertOpenApiContract,
  collectOpenApiFailures,
  diffOpenApiBreaking,
  type OpenApiDocument,
} from './openapi-contract.js';

function sampleDoc(overrides?: Partial<OpenApiDocument>): OpenApiDocument {
  return {
    openapi: '3.0.0',
    info: { title: 'Incubapp API', version: '1.0' },
    paths: {
      '/api/v1/health': {
        get: {
          summary: 'Liveness',
          responses: {
            '200': { description: 'ok' },
            '400': { description: 'Bad request' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Not found' },
            '429': { description: 'Too many requests' },
          },
        },
      },
      '/api/v1/startups': {
        get: {
          summary: 'List startups',
          responses: {
            '200': { description: 'ok' },
            '400': { description: 'Bad request' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Not found' },
            '429': { description: 'Too many requests' },
          },
        },
      },
    },
    ...overrides,
  };
}

describe('OpenAPI contract', () => {
  it('documento', () => {
    const doc = sampleDoc();
    expect(() => assertOpenApiContract(doc)).not.toThrow();
    const paths = Object.keys(doc.paths ?? {});
    expect(paths.every((p) => p.startsWith('/api/v1'))).toBe(true);
    expect(paths.some((p) => p.includes('/api/auth'))).toBe(false);
  });

  it('operacion incompleta', () => {
    const doc = sampleDoc({
      paths: {
        '/api/v1/health': {
          get: {
            summary: 'Liveness',
            responses: {
              '200': { description: 'ok' },
              '400': { description: 'Bad request' },
              // missing 401
              '403': { description: 'Forbidden' },
              '404': { description: 'Not found' },
              '429': { description: 'Too many requests' },
            },
          },
        },
      },
    });

    const failures = collectOpenApiFailures(doc);
    expect(failures.some((f) => f.reason === 'missing response 401')).toBe(
      true,
    );
    expect(() => assertOpenApiContract(doc)).toThrow(/401/);
  });

  it('diff breaking path', () => {
    const previous = sampleDoc();
    const next = sampleDoc({
      paths: {
        '/api/v1/health': previous.paths?.['/api/v1/health'],
      },
    });
    expect(diffOpenApiBreaking(previous, next)).toContain(
      'removed path /api/v1/startups',
    );
  });
});
