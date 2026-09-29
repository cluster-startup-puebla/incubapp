import { SetMetadata } from '@nestjs/common';

export const REQUIRES_TENANT_KEY = 'requiresTenant';

/** Tenant resolution must succeed. Account routes (sessions) do not use this. */
export const RequiresTenant = () => SetMetadata(REQUIRES_TENANT_KEY, true);
