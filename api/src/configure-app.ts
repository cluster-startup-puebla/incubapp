import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';

export function configureApp(app: INestApplication): void {
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

  app.enableCors({
    origin: webOrigin,
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
