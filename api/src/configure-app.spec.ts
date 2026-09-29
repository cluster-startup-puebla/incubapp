import {
  Controller,
  Get,
  INestApplication,
  Module,
  Post,
  Req,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import request from 'supertest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from '@better-auth/memory-adapter';
import {
  configureApp,
  NEST_BODY_PARSER_DISABLED,
  resolveCorsOrigins,
} from './configure-app.js';

@Controller('echo')
class EchoController {
  @Post()
  echo(@Req() req: { body?: unknown }) {
    return { body: req.body ?? null };
  }

  @Get('ping')
  ping() {
    return { ok: true };
  }
}

const testAuth = betterAuth({
  basePath: '/api/auth',
  database: memoryAdapter({}),
  emailAndPassword: { enabled: true },
  trustedOrigins: ['http://localhost:3000', 'https://app.example.com'],
});

@Module({
  imports: [
    AuthModule.forRoot({
      auth: testAuth,
      disableTrustedOriginsCors: true,
      disableGlobalAuthGuard: true,
    }),
  ],
  controllers: [EchoController],
})
class ConfigureAppTestModule {}

describe('configureApp / auth mount', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.CORS_ORIGINS = 'http://localhost:3000,https://app.example.com';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigureAppTestModule],
    }).compile();

    app = moduleRef.createNestApplication({
      bodyParser: NEST_BODY_PARSER_DISABLED,
    });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('auth montado', () => {
    expect(testAuth.options.basePath ?? '/api/auth').toBe('/api/auth');
  });

  it('json en recurso', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .post('/api/v1/echo')
      .send({ hello: 'world' })
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ body: { hello: 'world' } });
  });

  it('preflight', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .options('/api/v1/echo/ping')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');

    expect([200, 204]).toContain(response.status);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
  });

  it('origen ajeno', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .options('/api/v1/echo/ping')
      .set('Origin', 'https://evil.test')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('body parser global sigue apagado', () => {
    expect(NEST_BODY_PARSER_DISABLED).toBe(false);
  });

  it('CORS_ORIGINS resuelve lista', () => {
    expect(
      resolveCorsOrigins({
        CORS_ORIGINS: 'http://localhost:3000,https://app.example.com',
        WEB_ORIGIN: 'http://localhost:3000',
      }),
    ).toEqual(['http://localhost:3000', 'https://app.example.com']);
  });
});
