import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { resolveTrustedOrigins } from './auth/trusted-origins.js';

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

export function configureApp(app: INestApplication): void {
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
  const document = SwaggerModule.createDocument(app, config);

  app
    .getHttpAdapter()
    .get(
      '/openapi.json',
      (_req: unknown, res: { json: (body: unknown) => void }) => {
        res.json(document);
      },
    );

  app.use('/reference', apiReference({ content: document }));
}
