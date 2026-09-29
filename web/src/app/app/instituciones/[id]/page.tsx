'use client';

import { use, useMemo } from 'react';
import { authClient } from '@/lib/auth-client';
import { InstitutionDetail } from './institution-detail';

const EDIT_ROLES = new Set(['superadmin', 'cluster_admin', 'coorganizer']);
const DELETE_ROLES = new Set(['superadmin', 'cluster_admin']);

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

export default function InstitutionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: session } = authClient.useSession();
  const { canEdit, canDelete } = useMemo(() => {
    const roles = rolesFromSession(session?.user as SessionUser | undefined);
    return {
      canEdit: roles.some((role) => EDIT_ROLES.has(role)),
      canDelete: roles.some((role) => DELETE_ROLES.has(role)),
    };
  }, [session]);

  return <InstitutionDetail id={id} canEdit={canEdit} canDelete={canDelete} />;
}
