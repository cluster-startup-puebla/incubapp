import { z } from 'zod';

const nodeEnvSchema = z.enum(['development', 'production', 'test']);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().min(1),
  WEB_ORIGIN: z.string().min(1),
  CORS_ORIGINS: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    )
    .pipe(z.array(z.string().min(1)).min(1)),
  PORT: z.coerce
    .number()
    .refine((port) => Number.isFinite(port), 'PORT must be a number'),
  NODE_ENV: nodeEnvSchema,
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce
    .number()
    .refine((port) => Number.isFinite(port), 'SMTP_PORT must be a number'),
  SMTP_FROM: z.string().min(1),
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce
    .number()
    .refine((port) => Number.isFinite(port), 'MINIO_PORT must be a number'),
  MINIO_USE_SSL: z.enum(['true', 'false']),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

function formatEnvError(error: z.ZodError): Error {
  const issue = error.issues[0];
  const variable = issue.path[0];
  if (typeof variable === 'string') {
    return new Error(
      `Invalid environment variable ${variable}: ${issue.message}`,
    );
  }
  return new Error(`Invalid environment: ${issue.message}`);
}

export function parseEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw formatEnvError(result.error);
  }
  return result.data;
}

export function validateEnv(config: Record<string, unknown>): Env {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined || value === null) {
      normalized[key] = undefined;
    } else if (typeof value === 'string') {
      normalized[key] = value;
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      normalized[key] = String(value);
    }
  }
  return parseEnv(normalized);
}
