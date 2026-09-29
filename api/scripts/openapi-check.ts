/**
 * Builds a lightweight OpenAPI document from controller metadata and
 * asserts the T4.14 contract. Does not need Postgres/Redis/MinIO.
 */
import 'dotenv/config';
import { Module } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { assertOpenApiContract } from '../src/common/openapi/openapi-contract.js';
import { HealthController } from '../src/health/health.controller.js';
import { HealthService } from '../src/health/health.service.js';
import { SessionsController } from '../src/sessions/sessions.controller.js';
import { SessionsService } from '../src/sessions/sessions.service.js';
import { StartupsController } from '../src/startups/startups.controller.js';
import { StartupsService } from '../src/startups/startups.service.js';

@Module({
  controllers: [HealthController, SessionsController, StartupsController],
  providers: [
    {
      provide: HealthService,
      useValue: {
        liveness: () => ({ status: 'ok' }),
        readiness: async () => ({
          status: 'ok',
          postgres: 'up',
          redis: 'up',
        }),
      },
    },
    {
      provide: SessionsService,
      useValue: {
        list: async () => [],
        revoke: async () => undefined,
        revokeAll: async () => undefined,
        changePassword: async () => undefined,
      },
    },
    {
      provide: StartupsService,
      useValue: {
        list: async () => ({ items: [], total: 0 }),
        get: async () => ({}),
        create: async () => ({}),
        update: async () => ({}),
        remove: async () => ({}),
      },
    },
  ],
})
class OpenApiCheckModule {}

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [OpenApiCheckModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();

  const config = new DocumentBuilder()
    .setTitle('Incubapp API')
    .setDescription('REST resources under /api/v1')
    .setVersion('1.0')
    .build();

  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));

  assertOpenApiContract(document);
  // eslint-disable-next-line no-console
  console.log(
    `openapi:check ok (${Object.keys(document.paths ?? {}).length} paths)`,
  );

  await app.close();
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
