import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { IncubationsController } from './incubations.controller.js';
import { IncubationsService } from './incubations.service.js';

@Module({
  imports: [AuthzModule, AuditModule, AnalyticsModule],
  controllers: [IncubationsController],
  providers: [IncubationsService],
  exports: [IncubationsService],
})
export class IncubationsModule {}
