'use client';

import { useMemo } from 'react';
import { authClient } from '@/lib/auth-client';
import { hasRole, rolesFromSession, type SessionUser } from '../session-roles';
import { StartupsList } from './startups-list';

const CREATE_ROLES = new Set([
  'superadmin',
  'cluster_admin',
  'coorganizer',
  'director',
  'staff',
]);

export default function StartupsPage() {
  const { data: session } = authClient.useSession();
  const canCreate = useMemo(() => {
    const roles = rolesFromSession(session?.user as SessionUser | undefined);
    return hasRole(roles, CREATE_ROLES);
  }, [session]);

  return <StartupsList canCreate={canCreate} />;
}
