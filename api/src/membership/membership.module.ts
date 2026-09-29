import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { MembershipService } from './membership.service.js';
import { MembershipsController } from './memberships.controller.js';
import { MembershipsHttpService } from './memberships-http.service.js';

@Module({
  imports: [AuditModule],
  controllers: [MembershipsController],
  providers: [MembershipService, MembershipsHttpService],
  exports: [MembershipService],
})
export class MembershipModule {}
