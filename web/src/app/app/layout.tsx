'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PortalNav } from '@/components/resource/portal-nav';
import { apiClient } from '@/lib/api/client';
import { authClient } from '@/lib/auth-client';
import { TenantTheme } from '@/theme/tenant-theme';
import { PortalBrandProvider, usePortalBrand } from './portal-brand';
import { rolesFromSession, type SessionUser } from './session-roles';

export default function AppPortalLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const sentToLogin = useRef(false);

  useEffect(() => {
    if (isPending || session || sentToLogin.current) {
      return;
    }
    sentToLogin.current = true;
    router.replace('/login');
  }, [isPending, session, router]);

  if (isPending) {
    return <p>Cargando sesión</p>;
  }

  if (!session) {
    return <Link href="/login">Ir a login</Link>;
  }

  const user = session.user as SessionUser & { email?: string };
  const role = rolesFromSession(user);

  return (
    <PortalBrandProvider>
      <PortalShell role={role} email={user.email ?? ''}>
        {children}
      </PortalShell>
    </PortalBrandProvider>
  );
}

function PortalShell({
  role,
  email,
  children,
}: {
  role: string[];
  email: string;
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
      <div className="flex min-h-screen">
        <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/40 p-4">
          <p className="mb-4 px-3 text-sm font-semibold">Incubapp</p>
          <PortalNav role={role} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-end gap-3 border-b border-border px-6 py-3">
            <span className="text-sm text-muted-foreground">{email}</span>
            <Button
              type="button"
              variant="outline"
              onClick={() => void authClient.signOut()}
            >
              Salir
            </Button>
          </header>
          <div className="flex-1 p-6">{children}</div>
        </div>
      </div>
    </TenantTheme>
  );
}
