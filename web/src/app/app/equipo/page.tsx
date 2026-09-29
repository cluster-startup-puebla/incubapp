'use client';

import { useEffect, useMemo, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { apiClient } from '@/lib/api/client';
import { hasRole, rolesFromSession, type SessionUser } from '../session-roles';
import { EquipoList } from './equipo-list';

const INVITE_ROLES = new Set([
  'superadmin',
  'cluster_admin',
  'coorganizer',
  'director',
]);

const ASSIGN_CLUSTER_ADMIN = new Set(['superadmin', 'cluster_admin']);

type MembershipScope = {
  scopeType: string;
  scopeId: string;
};

export default function EquipoPage() {
  const { data: session } = authClient.useSession();
  const roles = useMemo(
    () => rolesFromSession(session?.user as SessionUser | undefined),
    [session],
  );
  const canInvite = hasRole(roles, INVITE_ROLES);
  const canAssignClusterAdmin = hasRole(roles, ASSIGN_CLUSTER_ADMIN);
  const [scopeId, setScopeId] = useState<string | null>(null);

  useEffect(() => {
    if (!canInvite) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const body = await apiClient<{ data: MembershipScope[] }>(
        '/api/v1/memberships?page=1',
      );
      const incubator = body.data.find((row) => row.scopeType === 'incubator');
      if (!cancelled) {
        setScopeId(incubator?.scopeId ?? null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canInvite]);

  return (
    <EquipoList
      canInvite={canInvite && Boolean(scopeId)}
      canAssignClusterAdmin={canAssignClusterAdmin}
      scopeType="incubator"
      scopeId={scopeId ?? ''}
    />
  );
}
