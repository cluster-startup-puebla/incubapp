import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { Request } from 'express';
import { AppModule } from './app.module.js';
import { configureApp, NEST_BODY_PARSER_DISABLED } from './configure-app.js';

function toHeaders(req: Request): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bodyParser: NEST_BODY_PARSER_DISABLED,
  });
  const { auth } = await import('./auth.js');
  configureApp(app, {
    isSuperAdmin: async (req) => {
      const session = await auth.api.getSession({
        headers: toHeaders(req),
      });
      return Boolean(
        session?.user &&
        (session.user as { isSuperAdmin?: boolean }).isSuperAdmin,
      );
    },
  });
  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
