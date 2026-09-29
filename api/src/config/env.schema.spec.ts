import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from './env.schema.js';

const validFixture: Record<string, string> = {
  DATABASE_URL: 'postgresql://incubapp:incubapp@localhost:5433/incubapp',
  REDIS_URL: 'redis://localhost:6379',
  BETTER_AUTH_SECRET: '01234567890123456789012345678901',
  BETTER_AUTH_URL: 'http://localhost:3001',
  WEB_ORIGIN: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000',
  PORT: '3001',
  NODE_ENV: 'development',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1026',
  SMTP_FROM: 'incubapp@localhost',
  MINIO_ENDPOINT: 'localhost',
  MINIO_PORT: '9000',
  MINIO_USE_SSL: 'false',
  MINIO_ACCESS_KEY: 'incubapp',
  MINIO_SECRET_KEY: 'incubapp-secret',
  MINIO_BUCKET: 'incubapp',
};

describe('parseEnv', () => {
  it('parsea env valido', () => {
    const env = parseEnv(validFixture);

    expect(env.DATABASE_URL).toBe(validFixture.DATABASE_URL);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
    expect(env.PORT).toBe(3001);
  });

  it('falta DATABASE_URL', () => {
    const incomplete = { ...validFixture };
    delete incomplete.DATABASE_URL;

    expect(() => parseEnv(incomplete)).toThrow(/DATABASE_URL/);
  });

  it('secret corto', () => {
    expect(() =>
      parseEnv({
        ...validFixture,
        BETTER_AUTH_SECRET: '0123456789',
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('PORT no numerico', () => {
    expect(() =>
      parseEnv({
        ...validFixture,
        PORT: 'abc',
      }),
    ).toThrow(/PORT/);
  });

  it('CORS_ORIGINS vacio', () => {
    expect(() =>
      parseEnv({
        ...validFixture,
        CORS_ORIGINS: '',
      }),
    ).toThrow(/CORS_ORIGINS/);
  });

  it('example sin secretos', () => {
    const apiRoot = join(import.meta.dirname, '../..');
    const examplePath = join(apiRoot, '.env.example');
    const envPath = join(apiRoot, '.env');
    const gitignorePath = join(apiRoot, '.gitignore');

    const example = readFileSync(examplePath, 'utf8');
    const gitignore = readFileSync(gitignorePath, 'utf8');

    expect(gitignore).toMatch(/(^|\n)\.env(\n|$)/);

    if (existsSync(envPath)) {
      const live = readFileSync(envPath, 'utf8');
      const secretMatch = live.match(/^BETTER_AUTH_SECRET=(.+)$/m);
      if (secretMatch?.[1]) {
        expect(example).not.toContain(secretMatch[1]);
      }
    }
  });
});
