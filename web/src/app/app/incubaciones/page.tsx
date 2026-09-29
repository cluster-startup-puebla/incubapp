'use client';

import { useMemo } from 'react';
import { authClient } from '@/lib/auth-client';
import { hasRole, rolesFromSession, type SessionUser } from '../session-roles';
import { IncubacionesList } from './incubaciones-list';

const EDIT_ROLES = new Set([
  'superadmin',
  'cluster_admin',
  'coorganizer',
  'director',
  'staff',
]);

export default function IncubacionesPage() {
  const { data: session } = authClient.useSession();
  const canEdit = useMemo(() => {
    const roles = rolesFromSession(session?.user as SessionUser | undefined);
    return hasRole(roles, EDIT_ROLES);
  }, [session]);

  return <IncubacionesList canEdit={canEdit} />;
}
