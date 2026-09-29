import { Module } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard.js';

@Module({
  providers: [PermissionsGuard],
  exports: [PermissionsGuard],
})
export class AuthzModule {}
