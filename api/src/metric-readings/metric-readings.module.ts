import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { MetricReadingsController } from './metric-readings.controller.js';
import { MetricReadingsService } from './metric-readings.service.js';

@Module({
  imports: [AuthzModule, AuditModule],
  controllers: [MetricReadingsController],
  providers: [MetricReadingsService],
  exports: [MetricReadingsService],
})
export class MetricReadingsModule {}
