import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { baseClient } from '../prisma/prisma.client.js';
import {
  RESET_PASSWORD_SUBJECT,
  VERIFY_EMAIL_SUBJECT,
} from '../mail/mailer.service.js';
import { sendMail } from '../mail/send-mail.js';
import { createRedisSecondaryStorage } from './redis-secondary-storage.js';
import { resolveTrustedOrigins } from './trusted-origins.js';
import type { AuthRateLimiter } from './auth-rate-limit.js';

export const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;
export const MIN_PASSWORD_LENGTH = 10;

const RATE_LIMITED_PATHS = new Set([
  '/sign-in/email',
  '/sign-up/email',
  '/request-password-reset',
]);

export type AuthEnvInput = {
  BETTER_AUTH_URL: string;
  WEB_ORIGIN?: string;
  CORS_ORIGINS?: string | string[];
};

export type BuildAuthOptionsDeps = {
  sendMailFn?: typeof sendMail;
  secondaryStorage?: ReturnType<typeof createRedisSecondaryStorage>;
  includeDatabase?: boolean;
  rateLimiter?: AuthRateLimiter;
};

function isHttpsUrl(url: string): boolean {
  return url.toLowerCase().startsWith('https://');
}

function extractEmail(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const email = (body as { email?: unknown }).email;
  return typeof email === 'string' && email.trim().length > 0
    ? email.trim()
    : undefined;
}

function extractClientIp(ctx: {
  getIpAddress?: () => string | null | undefined;
  request?: {
    headers?: Headers | Record<string, string | string[] | undefined>;
  };
}): string {
  const fromHelper = ctx.getIpAddress?.();
  if (fromHelper) {
    return fromHelper;
  }
  const headers = ctx.request?.headers;
  if (!headers) {
    return 'unknown';
  }
  const read = (name: string): string | undefined => {
    if (typeof (headers as Headers).get === 'function') {
      return (headers as Headers).get(name) ?? undefined;
    }
    const value = (headers as Record<string, string | string[] | undefined>)[
      name
    ];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  };
  return (
    read('x-forwarded-for')?.split(',')[0]?.trim() ||
    read('x-real-ip') ||
    'unknown'
  );
}

function isAuthFailure(returned: unknown): boolean {
  if (!returned) {
    return false;
  }
  if (isAPIError(returned)) {
    const code = returned.statusCode ?? 0;
    return code >= 400 && code !== 429;
  }
  if (returned instanceof Error) {
    return true;
  }
  return false;
}

/**
 * Pure Better Auth options builder. Specs inspect this without booting Nest.
 * The live `auth` instance in auth.ts must call the same function.
 */
export function buildAuthOptions(
  env: AuthEnvInput,
  deps: BuildAuthOptionsDeps = {},
) {
  const trustedOrigins = resolveTrustedOrigins(env);
  const useSecureCookies = isHttpsUrl(env.BETTER_AUTH_URL);
  const mailerSend = deps.sendMailFn ?? sendMail;
  const includeDatabase = deps.includeDatabase !== false;
  const rateLimiter = deps.rateLimiter;

  return {
    appName: 'Incubapp',
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins,
    ...(includeDatabase
      ? {
          database: prismaAdapter(baseClient, {
            provider: 'postgresql' as const,
          }),
        }
      : {}),
    ...(deps.secondaryStorage
      ? {
          secondaryStorage: deps.secondaryStorage,
          rateLimit: {
            enabled: true,
            storage: 'secondary-storage' as const,
          },
        }
      : {
          rateLimit: {
            enabled: true,
            storage: 'memory' as const,
          },
        }),
    user: {
      additionalFields: {
        isSuperAdmin: {
          type: 'boolean' as const,
          defaultValue: false,
          input: false,
        },
      },
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      storeSessionInDatabase: true,
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      requireEmailVerification: true,
      sendResetPassword: async ({
        user,
        url,
      }: {
        user: { email: string };
        url: string;
      }) => {
        await mailerSend({
          to: user.email,
          subject: RESET_PASSWORD_SUBJECT,
          text: url,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({
        user,
        url,
      }: {
        user: { email: string };
        url: string;
      }) => {
        await mailerSend({
          to: user.email,
          subject: VERIFY_EMAIL_SUBJECT,
          text: url,
        });
      },
    },
    advanced: {
      useSecureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: useSecureCookies,
      },
    },
    ...(rateLimiter
      ? {
          hooks: {
            before: createAuthMiddleware(async (ctx) => {
              if (!RATE_LIMITED_PATHS.has(ctx.path)) {
                return;
              }
              const email = extractEmail(ctx.body);
              if (!email) {
                return;
              }
              const decision = await rateLimiter.check(
                extractClientIp(ctx),
                email,
              );
              if (!decision.allowed) {
                throw new APIError(
                  'TOO_MANY_REQUESTS',
                  {
                    message: 'Too many attempts. Try again later.',
                    code: 'TOO_MANY_REQUESTS',
                  },
                  { 'Retry-After': String(decision.retryAfterSeconds) },
                );
              }
            }),
            after: createAuthMiddleware(async (ctx) => {
              if (!RATE_LIMITED_PATHS.has(ctx.path)) {
                return;
              }
              const email = extractEmail(ctx.body);
              if (!email) {
                return;
              }
              const ip = extractClientIp(ctx);
              const returned = ctx.context.returned;
              if (ctx.path === '/request-password-reset') {
                await rateLimiter.recordFailure(ip, email);
                return;
              }
              if (isAuthFailure(returned)) {
                await rateLimiter.recordFailure(ip, email);
              }
            }),
          },
        }
      : {}),
  };
}

export type AuthOptions = ReturnType<typeof buildAuthOptions>;
