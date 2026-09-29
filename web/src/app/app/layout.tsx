'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PortalNav } from '@/components/resource/portal-nav';
import { authClient } from '@/lib/auth-client';
import { TenantTheme } from '@/theme/tenant-theme';

type SessionUser = {
  role?: string;
  roles?: string[];
};

function rolesFromSession(user: SessionUser | undefined): string | string[] {
  if (!user) return [];
  if (user.roles?.length) return user.roles;
  if (user.role) return user.role;
  return [];
}

export default function AppPortalLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !session) {
      router.replace('/login');
    }
  }, [isPending, session, router]);

  if (isPending) {
    return <p>Cargando sesión</p>;
  }

  if (!session) {
    return <Link href="/login">Ir a login</Link>;
  }

  const role = rolesFromSession(session.user as SessionUser);

  return (
    <TenantTheme slug={null}>
      <PortalNav role={role} />
      {children}
    </TenantTheme>
  );
}
