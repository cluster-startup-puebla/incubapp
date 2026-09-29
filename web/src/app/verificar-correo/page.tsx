'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function VerifyEmailView({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setPending(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      const { error: verifyError } = await authClient.verifyEmail({
        query: { token },
      });

      if (cancelled) {
        return;
      }

      setPending(false);

      if (verifyError) {
        setError(verifyError.message ?? 'No se pudo verificar el correo');
        return;
      }

      router.push('/login');
      router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (!token) {
    return (
      <div className="grid max-w-sm gap-3">
        <h1 className="text-xl font-semibold">Verificar correo</h1>
        <p className="text-sm text-muted-foreground">
          Falta el token de verificación.
        </p>
      </div>
    );
  }

  return (
    <div className="grid max-w-sm gap-3">
      <h1 className="text-xl font-semibold">Verificar correo</h1>
      {pending ? (
        <p className="text-sm text-muted-foreground">Verificando…</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function VerifyEmailPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  return <VerifyEmailView token={token} />;
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="grid max-w-sm gap-3">
          <h1 className="text-xl font-semibold">Verificar correo</h1>
          <p className="text-sm text-muted-foreground">Cargando…</p>
        </div>
      }
    >
      <VerifyEmailPageInner />
    </Suspense>
  );
}
