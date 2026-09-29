import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import express, { type Request, type RequestHandler } from 'express';
import helmet from 'helmet';
import { resolveTrustedOrigins } from './auth/trusted-origins.js';
import { configureApiReference } from './common/openapi/api-reference.js';

/** Nest must keep the global body parser off so Better Auth can read raw bodies. */
export const NEST_BODY_PARSER_DISABLED = false;

/** JSON / urlencoded body size cap applied outside `/api/auth`. */
export const JSON_BODY_LIMIT = '1mb';
export const JSON_BODY_LIMIT_BYTES = 1024 * 1024;

/** Single reverse-proxy hop; do not use `true` (trusts arbitrary XFF). */
export const TRUST_PROXY_HOPS = 1;

const AUTH_BASE_PATH = '/api/auth';

export function resolveCorsOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return resolveTrustedOrigins({
    CORS_ORIGINS: env.CORS_ORIGINS,
    WEB_ORIGIN: env.WEB_ORIGIN,
  });
}

function isAuthPath(path: string): boolean {
  const pathname = path.split('?')[0] ?? '';
  return (
    pathname === AUTH_BASE_PATH || pathname.startsWith(`${AUTH_BASE_PATH}/`)
  );
}

/**
 * Remount JSON/urlencoded parsers with a 1 MB limit for non-auth routes.
 * Prepended so this runs before Better Auth's default (100kb) remount;
 * `/api/auth` is left unparsed so Better Auth can read the raw body.
 */
function mountJsonBodyLimit(app: INestApplication): void {
  const expressApp = app.getHttpAdapter().getInstance() as express.Express;
  const jsonParser = express.json({ limit: JSON_BODY_LIMIT });
  const urlencodedParser = express.urlencoded({
    extended: true,
    limit: JSON_BODY_LIMIT,
  });

  const middleware: RequestHandler = (req, res, next) => {
    const path = req.originalUrl ?? req.url ?? '';
    if (isAuthPath(path)) {
      next();
      return;
    }
    jsonParser(req, res, (err?: unknown) => {
      if (err) {
        next(err);
        return;
      }
      urlencodedParser(req, res, next);
    });
  };

  expressApp.use(middleware);
  const stack = expressApp.router.stack as unknown[];
  const layer = stack.pop();
  if (layer !== undefined) {
    stack.unshift(layer);
  }
}

export type ConfigureAppOptions = {
  isSuperAdmin?: (req: Request) => Promise<boolean>;
};

export function configureApp(
  app: INestApplication,
  options: ConfigureAppOptions = {},
): void {
  const nestApp = app as NestExpressApplication;

  nestApp.set('trust proxy', TRUST_PROXY_HOPS);
  nestApp.disable('x-powered-by');
  nestApp.use(helmet());

  mountJsonBodyLimit(nestApp);

  const corsOrigins = resolveCorsOrigins();

  nestApp.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, corsOrigins.includes(origin));
    },
    credentials: true,
  });
  nestApp.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('Incubapp API')
    .setDescription('REST resources under /api/v1')
    .setVersion('1.0')
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));

  nestApp
    .getHttpAdapter()
    .get(
      '/openapi.json',
      (_req: unknown, res: { json: (body: unknown) => void }) => {
        res.json(document);
      },
    );

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const apiReferenceEnabled = process.env.API_REFERENCE_ENABLED !== 'false';

  configureApiReference(nestApp, {
    document,
    nodeEnv,
    apiReferenceEnabled,
    isSuperAdmin: options.isSuperAdmin ?? (() => Promise.resolve(false)),
  });
}
