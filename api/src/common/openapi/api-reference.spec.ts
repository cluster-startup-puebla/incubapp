import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import request from 'supertest';
import { ApiStandardErrors } from './api-standard-errors.decorator.js';
import {
  configureApiReference,
  isApiReferencePublic,
} from './api-reference.js';

@ApiTags('fixture')
@ApiStandardErrors()
@AllowAnonymous()
@Controller('fixture-ref')
class FixtureRefController {
  @Get()
  @ApiOperation({ summary: 'Fixture' })
  ok() {
    return { ok: true };
  }
}

@Module({ controllers: [FixtureRefController] })
class FixtureModule {}

describe('api reference access', () => {
  it('prod cerrado', async () => {
    expect(
      isApiReferencePublic({
        nodeEnv: 'production',
        apiReferenceEnabled: true,
      }),
    ).toBe(false);

    expect(
      isApiReferencePublic({
        nodeEnv: 'development',
        apiReferenceEnabled: true,
      }),
    ).toBe(true);

    expect(
      isApiReferencePublic({
        nodeEnv: 'production',
        apiReferenceEnabled: false,
      }),
    ).toBe(false);

    const moduleRef = await Test.createTestingModule({
      imports: [FixtureModule],
    }).compile();

    const app: INestApplication = moduleRef.createNestApplication();
    configureApiReference(app, {
      document: {
        openapi: '3.0.0',
        info: { title: 't', version: '1' },
        paths: {},
      },
      nodeEnv: 'production',
      apiReferenceEnabled: true,
      isSuperAdmin: () => Promise.resolve(false),
    });
    await app.init();

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/reference');
    expect(response.status).toBe(401);

    await app.close();
  });

  it('prod super admin', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FixtureModule],
    }).compile();

    const app: INestApplication = moduleRef.createNestApplication();
    configureApiReference(app, {
      document: {
        openapi: '3.0.0',
        info: { title: 't', version: '1' },
        paths: {},
      },
      nodeEnv: 'production',
      apiReferenceEnabled: true,
      isSuperAdmin: () => Promise.resolve(true),
    });
    await app.init();

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/reference/');
    // Scalar may redirect or serve HTML; either way it is not 401.
    expect(response.status).not.toBe(401);

    await app.close();
  });

  it('disabled via env', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FixtureModule],
    }).compile();

    const app: INestApplication = moduleRef.createNestApplication();
    configureApiReference(app, {
      document: {
        openapi: '3.0.0',
        info: { title: 't', version: '1' },
        paths: {},
      },
      nodeEnv: 'development',
      apiReferenceEnabled: false,
      isSuperAdmin: () => Promise.resolve(true),
    });
    await app.init();

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/reference');
    expect(response.status).toBe(404);

    await app.close();
  });
});
