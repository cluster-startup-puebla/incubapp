export type TrustedOriginsEnv = {
  CORS_ORIGINS?: string | string[];
  WEB_ORIGIN?: string;
};

export function resolveTrustedOrigins(env: TrustedOriginsEnv): string[] {
  if (Array.isArray(env.CORS_ORIGINS)) {
    const origins = env.CORS_ORIGINS.map((origin) => origin.trim()).filter(
      (origin) => origin.length > 0,
    );
    if (origins.length > 0) {
      return origins;
    }
  }

  if (
    typeof env.CORS_ORIGINS === 'string' &&
    env.CORS_ORIGINS.trim().length > 0
  ) {
    return env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }

  if (env.WEB_ORIGIN && env.WEB_ORIGIN.trim().length > 0) {
    return [env.WEB_ORIGIN.trim()];
  }

  throw new Error('Missing trusted origins: set CORS_ORIGINS or WEB_ORIGIN');
}
