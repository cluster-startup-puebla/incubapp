'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { portalPath, type SessionUser } from '@/app/app/session-roles';

export function PortalEntry({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const sent = useRef(false);

  useEffect(() => {
    if (isPending || !session || sent.current) {
      return;
    }
    sent.current = true;
    router.replace(portalPath(session.user as SessionUser | undefined));
  }, [isPending, session, router]);

  if (isPending || session) {
    return <p>Cargando sesión</p>;
  }

  return children;
}
