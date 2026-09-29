'use client';

import { useEffect, useMemo, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { apiClient } from '@/lib/api/client';
import { hasRole, rolesFromSession, type SessionUser } from '../session-roles';
import { IncubadoraOwnPage } from './incubadora-own-page';

const EDIT_ROLES = new Set([
  'superadmin',
  'cluster_admin',
  'coorganizer',
  'director',
  'staff',
]);

export default function IncubadoraPage() {
  const { data: session } = authClient.useSession();
  const canEdit = useMemo(() => {
    const roles = rolesFromSession(session?.user as SessionUser | undefined);
    return hasRole(roles, EDIT_ROLES);
  }, [session]);
  const [incubatorId, setIncubatorId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const body = await apiClient<{
          data: { scopeType: string; scopeId: string }[];
        }>('/api/v1/memberships?page=1');
        const incubator = body.data?.find(
          (row) => row.scopeType === 'incubator',
        );
        if (cancelled) {
          return;
        }
        if (!incubator) {
          setMissing(true);
          return;
        }
        setIncubatorId(incubator.scopeId);
      } catch {
        if (!cancelled) {
          setMissing(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (missing) {
    return <p role="alert">No hay incubadora asignada.</p>;
  }

  if (!incubatorId) {
    return <p>Cargando</p>;
  }

  return <IncubadoraOwnPage incubatorId={incubatorId} canEdit={canEdit} />;
}
