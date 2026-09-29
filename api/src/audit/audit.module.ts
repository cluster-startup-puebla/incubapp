import { Module } from '@nestjs/common';
import { AuditLogInterceptor } from './audit-log.interceptor.js';
import { AuditLogService } from './audit-log.service.js';

@Module({
  providers: [AuditLogService, AuditLogInterceptor],
  exports: [AuditLogService, AuditLogInterceptor],
})
export class AuditModule {}
