import {
  buildAuthOptions,
  MIN_PASSWORD_LENGTH,
  SESSION_EXPIRES_IN_SECONDS,
} from './auth/auth-options.js';
import type { SecondaryStorage } from './auth/redis-secondary-storage.js';

describe('buildAuthOptions', () => {
  const baseEnv = {
    BETTER_AUTH_URL: 'http://localhost:3001',
    WEB_ORIGIN: 'http://localhost:3000',
  };

  it('password corta', () => {
    const options = buildAuthOptions(baseEnv, { includeDatabase: false });
    const min = options.emailAndPassword.minPasswordLength;
    expect(min).toBe(MIN_PASSWORD_LENGTH);
    expect('shortpass'.length).toBe(9);
    expect('shortpass'.length < min).toBe(true);
  });

  it('password de 10', () => {
    const options = buildAuthOptions(baseEnv, { includeDatabase: false });
    const min = options.emailAndPassword.minPasswordLength;
    expect('1234567890'.length).toBe(10);
    expect('1234567890'.length >= min).toBe(true);
  });

  it('verificacion requerida', () => {
    const options = buildAuthOptions(baseEnv, { includeDatabase: false });
    expect(options.emailAndPassword.requireEmailVerification).toBe(true);
  });

  it('origenes', () => {
    const options = buildAuthOptions(
      {
        BETTER_AUTH_URL: 'http://localhost:3001',
        CORS_ORIGINS: 'http://localhost:3000,https://app.example.com',
      },
      { includeDatabase: false },
    );
    expect(options.trustedOrigins).toEqual([
      'http://localhost:3000',
      'https://app.example.com',
    ]);
  });

  it('origenes cae a WEB_ORIGIN si CORS_ORIGINS no esta', () => {
    const options = buildAuthOptions(
      {
        BETTER_AUTH_URL: 'http://localhost:3001',
        WEB_ORIGIN: 'http://localhost:3000',
      },
      { includeDatabase: false },
    );
    expect(options.trustedOrigins).toEqual(['http://localhost:3000']);
  });

  it('cookie prod', () => {
    const options = buildAuthOptions(
      {
        BETTER_AUTH_URL: 'https://api.example.com',
        WEB_ORIGIN: 'https://app.example.com',
      },
      { includeDatabase: false },
    );
    expect(options.advanced.useSecureCookies).toBe(true);
    expect(options.advanced.defaultCookieAttributes).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    });
  });

  it('cookie local', () => {
    const options = buildAuthOptions(baseEnv, { includeDatabase: false });
    expect(options.advanced.useSecureCookies).toBe(false);
    expect(options.advanced.defaultCookieAttributes.secure).toBe(false);
    expect(options.advanced.defaultCookieAttributes.httpOnly).toBe(true);
    expect(options.advanced.defaultCookieAttributes.sameSite).toBe('lax');
  });

  it('sesion 7 dias', () => {
    const options = buildAuthOptions(baseEnv, { includeDatabase: false });
    expect(options.session.expiresIn).toBe(SESSION_EXPIRES_IN_SECONDS);
    expect(SESSION_EXPIRES_IN_SECONDS).toBe(60 * 60 * 24 * 7);
  });

  it('rate limit secondary storage cuando hay Redis', () => {
    const secondaryStorage: SecondaryStorage = {
      get: () => Promise.resolve(null),
      set: () => Promise.resolve(undefined),
      delete: () => Promise.resolve(undefined),
      getAndDelete: () => Promise.resolve(null),
      increment: () => Promise.resolve(1),
    };
    const options = buildAuthOptions(baseEnv, {
      includeDatabase: false,
      secondaryStorage,
    });
    expect(options.secondaryStorage).toBe(secondaryStorage);
    expect(options.rateLimit).toEqual({
      enabled: true,
      storage: 'secondary-storage',
    });
  });
});
