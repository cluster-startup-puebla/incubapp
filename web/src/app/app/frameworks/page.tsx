'use client';

import { useMemo } from 'react';
import { authClient } from '@/lib/auth-client';
import { FrameworksList } from './frameworks-list';

const CREATE_ROLES = new Set(['superadmin', 'cluster_admin', 'coorganizer']);

type SessionUser = {
  role?: string;
  roles?: string[];
  isSuperAdmin?: boolean;
};

function rolesFromSession(user: SessionUser | undefined): string[] {
  if (!user) return [];
  const roles = user.roles?.length
    ? [...user.roles]
    : user.role
      ? [user.role]
      : [];
  if (user.isSuperAdmin && !roles.includes('superadmin')) {
    roles.push('superadmin');
  }
  return roles;
}

export default function FrameworksPage() {
  const { data: session } = authClient.useSession();
  const canCreate = useMemo(() => {
    const roles = rolesFromSession(session?.user as SessionUser | undefined);
    return roles.some((role) => CREATE_ROLES.has(role));
  }, [session]);

  return <FrameworksList canCreate={canCreate} />;
}
