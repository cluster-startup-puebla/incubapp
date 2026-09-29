'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PortalNav } from '@/components/resource/portal-nav';
import { apiClient } from '@/lib/api/client';
import { authClient } from '@/lib/auth-client';
import { TenantTheme } from '@/theme/tenant-theme';
import { PortalBrandProvider, usePortalBrand } from './portal-brand';
import { rolesFromSession, type SessionUser } from './session-roles';

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

  const role = rolesFromSession(session.user as SessionUser | undefined);

  return (
    <PortalBrandProvider>
      <PortalShell role={role}>{children}</PortalShell>
    </PortalBrandProvider>
  );
}

function PortalShell({
  role,
  children,
}: {
  role: string[];
  children: ReactNode;
}) {
  const brand = usePortalBrand();

  useEffect(() => {
    const setSlug = brand?.setSlug;
    if (!setSlug) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const body = await apiClient<{
          data: { scopeType: string; scopeId: string }[];
        }>('/api/v1/memberships?page=1');
        const incubator = body.data?.find(
          (row) => row.scopeType === 'incubator',
        );
        if (!incubator || cancelled) {
          return;
        }
        const detail = await apiClient<{ slug: string }>(
          `/api/v1/incubators/${incubator.scopeId}`,
        );
        if (!cancelled && detail.slug) {
          setSlug(detail.slug);
        }
      } catch {
        // Sin membresía de incubadora el portal se queda en la paleta base.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [brand?.setSlug]);

  return (
    <TenantTheme slug={brand?.slug ?? null} revision={brand?.revision ?? 0}>
      <PortalNav role={role} />
      {children}
    </TenantTheme>
  );
}
