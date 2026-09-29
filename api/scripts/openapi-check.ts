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
import { FrameworksController } from '../src/frameworks/frameworks.controller.js';
import { FrameworksService } from '../src/frameworks/frameworks.service.js';
import { GeoUnitsController } from '../src/geo-units/geo-units.controller.js';
import { GeoUnitsService } from '../src/geo-units/geo-units.service.js';
import { IncubatorsController } from '../src/incubators/incubators.controller.js';
import { IncubatorsService } from '../src/incubators/incubators.service.js';
import { InstitutionsController } from '../src/institutions/institutions.controller.js';
import { InstitutionsService } from '../src/institutions/institutions.service.js';
import { MembershipsController } from '../src/membership/memberships.controller.js';
import { MembershipsHttpService } from '../src/membership/memberships-http.service.js';
import { SessionsController } from '../src/sessions/sessions.controller.js';
import { SessionsService } from '../src/sessions/sessions.service.js';
import { StartupsController } from '../src/startups/startups.controller.js';
import { StartupsService } from '../src/startups/startups.service.js';
import { UsersController } from '../src/users/users.controller.js';
import { UsersService } from '../src/users/users.service.js';
import { AuditLogInterceptor } from '../src/audit/audit-log.interceptor.js';
import { AuditLogService } from '../src/audit/audit-log.service.js';

@Module({
  controllers: [
    HealthController,
    SessionsController,
    StartupsController,
    InstitutionsController,
    GeoUnitsController,
    IncubatorsController,
    FrameworksController,
    MembershipsController,
    UsersController,
  ],
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
        listDeleted: async () => ({ items: [], total: 0 }),
        get: async () => ({}),
        getWithDeleted: async () => ({}),
        create: async () => ({}),
        update: async () => ({}),
        remove: async () => ({}),
        restore: async () => ({}),
        purge: async () => undefined,
      },
    },
    {
      provide: InstitutionsService,
      useValue: {
        list: async () => ({ items: [], total: 0 }),
        listDeleted: async () => ({ items: [], total: 0 }),
        get: async () => ({}),
        getWithDeleted: async () => ({}),
        create: async () => ({}),
        update: async () => ({}),
        remove: async () => ({}),
        restore: async () => ({}),
        purge: async () => undefined,
      },
    },
    {
      provide: GeoUnitsService,
      useValue: {
        list: async () => ({ items: [], total: 0 }),
        listDeleted: async () => ({ items: [], total: 0 }),
        listChildren: async () => ({ items: [], total: 0 }),
        get: async () => ({}),
        getWithDeleted: async () => ({}),
        create: async () => ({}),
        update: async () => ({}),
        remove: async () => ({}),
        restore: async () => ({}),
        purge: async () => undefined,
      },
    },
    {
      provide: IncubatorsService,
      useValue: {
        list: async () => ({ items: [], total: 0 }),
        listDeleted: async () => ({ items: [], total: 0 }),
        get: async () => ({}),
        getWithDeleted: async () => ({}),
        create: async () => ({}),
        update: async () => ({}),
        remove: async () => ({}),
        restore: async () => ({}),
        purge: async () => undefined,
        mapFeatures: async () => ({ type: 'FeatureCollection', features: [] }),
      },
    },
    {
      provide: FrameworksService,
      useValue: {
        list: async () => ({ items: [], total: 0 }),
        listDeleted: async () => ({ items: [], total: 0 }),
        get: async () => ({}),
        getWithDeleted: async () => ({}),
        create: async () => ({}),
        update: async () => ({}),
        addStage: async () => ({}),
        publish: async () => ({}),
        clone: async () => ({}),
        remove: async () => ({}),
        restore: async () => ({}),
        purge: async () => undefined,
      },
    },
    {
      provide: MembershipsHttpService,
      useValue: {
        list: async () => ({ items: [], total: 0 }),
        get: async () => ({}),
        invite: async () => ({}),
        acceptInvitation: async () => ({}),
        remove: async () => ({}),
      },
    },
    {
      provide: UsersService,
      useValue: {
        list: async () => ({ items: [], total: 0 }),
        get: async () => ({}),
      },
    },
    {
      provide: AuditLogService,
      useValue: { record: async () => undefined },
    },
    AuditLogInterceptor,
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
