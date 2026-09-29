'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { GeoList } from './geo-list';

type SessionUser = {
  role?: string;
  roles?: string[];
  isSuperAdmin?: boolean;
};

function isSuperAdmin(user: SessionUser | undefined): boolean {
  if (!user) {
    return false;
  }
  if (user.isSuperAdmin) {
    return true;
  }
  const roles = user.roles?.length ? user.roles : user.role ? [user.role] : [];
  return roles.includes('superadmin');
}

function GeoPageInner() {
  const searchParams = useSearchParams();
  const parentId = searchParams.get('parentId');
  const { data: session } = authClient.useSession();
  const canCreate = useMemo(
    () => isSuperAdmin(session?.user as SessionUser | undefined),
    [session],
  );

  return <GeoList parentId={parentId} canCreate={canCreate} />;
}

export default function GeoPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}
    >
      <GeoPageInner />
    </Suspense>
  );
}
