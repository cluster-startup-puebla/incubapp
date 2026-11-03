'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function Navbar() {
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();

  if (pathname.startsWith('/app')) {
    return null;
  }

  return (
    <nav>
      <Link href="/">Inicio</Link>
      {isPending ? (
        <span>Cargando sesión</span>
      ) : session ? (
        <>
          <span>{session.user.email}</span>
          <button type="button" onClick={() => void authClient.signOut()}>
            Salir
          </button>
        </>
      ) : (
        <>
          <Link href="/login">Entrar</Link>
          <Link href="/register">Registro</Link>
        </>
      )}
    </nav>
  );
}
