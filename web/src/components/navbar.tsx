'use client';

import Link from 'next/link';
import { authClient } from '@/lib/auth-client';

export function Navbar() {
  const { data: session, isPending } = authClient.useSession();

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
