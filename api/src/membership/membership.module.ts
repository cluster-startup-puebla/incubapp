import { Module } from '@nestjs/common';
import { MembershipService } from './membership.service.js';

@Module({
  providers: [MembershipService],
  exports: [MembershipService],
})
export class MembershipModule {}
