'use client';

import { use, useMemo } from 'react';
import { authClient } from '@/lib/auth-client';
import {
  hasRole,
  rolesFromSession,
  type SessionUser,
} from '../../../session-roles';
import { MetricsPanel } from './metrics-panel';

const VERIFY_ROLES = new Set([
  'superadmin',
  'cluster_admin',
  'coorganizer',
  'director',
  'staff',
]);

export default function StartupMetricsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: session } = authClient.useSession();
  const canVerify = useMemo(() => {
    const roles = rolesFromSession(session?.user as SessionUser | undefined);
    return hasRole(roles, VERIFY_ROLES);
  }, [session]);

  return <MetricsPanel startupId={id} canVerify={canVerify} />;
}
