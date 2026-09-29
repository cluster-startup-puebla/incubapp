import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { validateEnv } from './config/env.schema.js';
import { auth } from './auth.js';
import { HealthModule } from './health/health.module.js';
import { MinioModule } from './storage/minio.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    MinioModule,
    AuthModule.forRoot({
      auth,
      disableTrustedOriginsCors: true,
    }),
    HealthModule,
  ],
})
export class AppModule {}
