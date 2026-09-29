import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { GeoUnitsController } from './geo-units.controller.js';
import { GeoUnitsService } from './geo-units.service.js';

@Module({
  imports: [AuthzModule, AuditModule],
  controllers: [GeoUnitsController],
  providers: [GeoUnitsService],
  exports: [GeoUnitsService],
})
export class GeoUnitsModule {}
