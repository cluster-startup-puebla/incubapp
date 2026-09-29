import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module.js';
import { StartupsController } from './startups.controller.js';
import { StartupsService } from './startups.service.js';

@Module({
  imports: [AuthzModule],
  controllers: [StartupsController],
  providers: [StartupsService],
  exports: [StartupsService],
})
export class StartupsModule {}
