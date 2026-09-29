'use client';

import { use, useMemo } from 'react';
import { authClient } from '@/lib/auth-client';
import {
  hasRole,
  rolesFromSession,
  type SessionUser,
} from '../../session-roles';
import { IncubadoraDetail } from './incubadora-detail';

const EDIT_ROLES = new Set([
  'superadmin',
  'cluster_admin',
  'coorganizer',
  'director',
  'staff',
]);

export default function IncubadoraDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: session } = authClient.useSession();
  const canEdit = useMemo(() => {
    const roles = rolesFromSession(session?.user as SessionUser | undefined);
    return hasRole(roles, EDIT_ROLES);
  }, [session]);

  return <IncubadoraDetail id={id} canEdit={canEdit} />;
}
