import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { StartupsController } from './startups.controller.js';
import { StartupsService } from './startups.service.js';

@Module({
  imports: [AuthzModule, AuditModule, AnalyticsModule],
  controllers: [StartupsController],
  providers: [StartupsService],
  exports: [StartupsService],
})
export class StartupsModule {}
