'use client';

import { useMemo } from 'react';
import { authClient } from '@/lib/auth-client';
import { hasRole, rolesFromSession, type SessionUser } from '../session-roles';
import { IncubadorasList } from './incubadoras-list';

const CREATE_ROLES = new Set(['superadmin', 'cluster_admin', 'coorganizer']);

export default function IncubadorasPage() {
  const { data: session } = authClient.useSession();
  const canCreate = useMemo(() => {
    const roles = rolesFromSession(session?.user as SessionUser | undefined);
    return hasRole(roles, CREATE_ROLES);
  }, [session]);

  return <IncubadorasList canCreate={canCreate} />;
}
