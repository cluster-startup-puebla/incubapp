import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { FrameworksController } from './frameworks.controller.js';
import { FrameworksService } from './frameworks.service.js';

@Module({
  imports: [AuthzModule, AuditModule],
  controllers: [FrameworksController],
  providers: [FrameworksService],
  exports: [FrameworksService],
})
export class FrameworksModule {}
