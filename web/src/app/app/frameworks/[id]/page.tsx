'use client';

import { use, useMemo } from 'react';
import { authClient } from '@/lib/auth-client';
import { FrameworkDetail } from './framework-detail';

const CREATE_ROLES = new Set(['superadmin', 'cluster_admin', 'coorganizer']);
const PUBLISH_ROLES = new Set(['superadmin', 'cluster_admin']);

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

export default function FrameworkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: session } = authClient.useSession();
  const { canEdit, canPublish } = useMemo(() => {
    const roles = rolesFromSession(session?.user as SessionUser | undefined);
    return {
      canEdit: roles.some((role) => CREATE_ROLES.has(role)),
      canPublish: roles.some((role) => PUBLISH_ROLES.has(role)),
    };
  }, [session]);

  return <FrameworkDetail id={id} canEdit={canEdit} canPublish={canPublish} />;
}
