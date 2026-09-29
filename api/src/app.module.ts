import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { validateEnv } from './config/env.schema.js';
import { auth } from './auth.js';
import { AuthzModule } from './authz/authz.module.js';
import { RequestContextInterceptor } from './auth/request-context.interceptor.js';
import { HealthModule } from './health/health.module.js';
import { MailModule } from './mail/mail.module.js';
import { MembershipModule } from './membership/membership.module.js';
import { MinioModule } from './storage/minio.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { StartupsModule } from './startups/startups.module.js';
import { TenantContextGuard } from './tenant/tenant-context.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    MinioModule,
    MailModule,
    MembershipModule,
    AuthzModule,
    AuthModule.forRoot({
      auth,
      disableTrustedOriginsCors: true,
    }),
    HealthModule,
    SessionsModule,
    StartupsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: TenantContextGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor,
    },
  ],
})
export class AppModule {}
