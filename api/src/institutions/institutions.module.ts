import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { InstitutionsController } from './institutions.controller.js';
import { InstitutionsService } from './institutions.service.js';

@Module({
  imports: [AuthzModule, AuditModule],
  controllers: [InstitutionsController],
  providers: [InstitutionsService],
  exports: [InstitutionsService],
})
export class InstitutionsModule {}
