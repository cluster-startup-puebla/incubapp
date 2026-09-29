import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import type { Request } from 'express';
import { resolveTrustedOrigins } from './auth/trusted-origins.js';
import { configureApiReference } from './common/openapi/api-reference.js';

/** Nest must keep the global body parser off so Better Auth can read raw bodies. */
export const NEST_BODY_PARSER_DISABLED = false;

export function resolveCorsOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return resolveTrustedOrigins({
    CORS_ORIGINS: env.CORS_ORIGINS,
    WEB_ORIGIN: env.WEB_ORIGIN,
  });
}

export type ConfigureAppOptions = {
  isSuperAdmin?: (req: Request) => Promise<boolean>;
};

export function configureApp(
  app: INestApplication,
  options: ConfigureAppOptions = {},
): void {
  const corsOrigins = resolveCorsOrigins();

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('Incubapp API')
    .setDescription('REST resources under /api/v1')
    .setVersion('1.0')
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));

  app
    .getHttpAdapter()
    .get(
      '/openapi.json',
      (_req: unknown, res: { json: (body: unknown) => void }) => {
        res.json(document);
      },
    );

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const apiReferenceEnabled = process.env.API_REFERENCE_ENABLED !== 'false';

  configureApiReference(app, {
    document,
    nodeEnv,
    apiReferenceEnabled,
    isSuperAdmin: options.isSuperAdmin ?? (() => Promise.resolve(false)),
  });
}
