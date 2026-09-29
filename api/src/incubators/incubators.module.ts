import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { IncubatorsController } from './incubators.controller.js';
import { IncubatorsService } from './incubators.service.js';

@Module({
  imports: [AuthzModule, AuditModule],
  controllers: [IncubatorsController],
  providers: [IncubatorsService],
  exports: [IncubatorsService],
})
export class IncubatorsModule {}
