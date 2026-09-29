import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { validateEnv } from './config/env.schema.js';
import { auth } from './auth.js';
import { AuthzModule } from './authz/authz.module.js';
import { AuditModule } from './audit/audit.module.js';
import { RequestContextInterceptor } from './auth/request-context.interceptor.js';
import { EnvelopeInterceptor } from './common/http/envelope.interceptor.js';
import { ProblemDetailsFilter } from './common/http/problem-details.filter.js';
import { ZodValidationPipe } from './common/validation/zod-validation.pipe.js';
import { WriteRateLimitModule } from './common/throttle/write-rate-limit.module.js';
import { WriteRateLimitGuard } from './common/throttle/write-rate-limit.guard.js';
import { HealthModule } from './health/health.module.js';
import { FrameworksModule } from './frameworks/frameworks.module.js';
import { GeoUnitsModule } from './geo-units/geo-units.module.js';
import { IncubatorsModule } from './incubators/incubators.module.js';
import { InstitutionsModule } from './institutions/institutions.module.js';
import { IncubationsModule } from './incubations/incubations.module.js';
import { MailModule } from './mail/mail.module.js';
import { MembershipModule } from './membership/membership.module.js';
import { IdempotencyModule } from './idempotency/idempotency.module.js';
import { RequestLoggingInterceptor } from './logging/request-log.js';
import { MinioModule } from './storage/minio.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { StartupsModule } from './startups/startups.module.js';
import { TenantContextGuard } from './tenant/tenant-context.guard.js';
import { UsersModule } from './users/users.module.js';

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
    AuditModule,
    WriteRateLimitModule,
    IdempotencyModule,
    AuthModule.forRoot({
      auth,
      disableTrustedOriginsCors: true,
    }),
    HealthModule,
    SessionsModule,
    StartupsModule,
    InstitutionsModule,
    IncubationsModule,
    IncubatorsModule,
    FrameworksModule,
    GeoUnitsModule,
    UsersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: TenantContextGuard,
    },
    {
      provide: APP_GUARD,
      useExisting: WriteRateLimitGuard,
    },
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    {
      provide: APP_FILTER,
      useFactory: () => new ProblemDetailsFilter(process.env.NODE_ENV),
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: EnvelopeInterceptor,
    },
  ],
})
export class AppModule {}
