import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp, NEST_BODY_PARSER_DISABLED } from './configure-app.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bodyParser: NEST_BODY_PARSER_DISABLED,
  });
  configureApp(app);
  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
