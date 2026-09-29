'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

const MIN_PASSWORD_LENGTH = 10;
const SENT_MESSAGE =
  'Si existe una cuenta con ese correo, enviamos el enlace de recuperación.';

export function RecuperarView({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onRequestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email'));
    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/recuperar`
        : '/recuperar';

    await authClient.requestPasswordReset({
      email,
      redirectTo,
    });

    setPending(false);
    setMessage(SENT_MESSAGE);
  }

  async function onResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password'));

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
      );
      return;
    }

    setPending(true);
    const { error: resetError } = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    setPending(false);

    if (resetError) {
      setError(resetError.message ?? 'No se pudo actualizar la contraseña');
      return;
    }

    router.push('/login');
    router.refresh();
  }

  if (token) {
    return (
      <form onSubmit={onResetPassword} className="grid max-w-sm gap-3">
        <h1 className="text-xl font-semibold">Nueva contraseña</h1>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={pending}>
          Guardar contraseña
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onRequestReset} className="grid max-w-sm gap-3">
      <h1 className="text-xl font-semibold">Recuperar contraseña</h1>
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      </div>
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        Enviar enlace
      </Button>
    </form>
  );
}

function RecuperarPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  return <RecuperarView token={token} />;
}

export default function RecuperarPage() {
  return (
    <Suspense
      fallback={
        <div className="grid max-w-sm gap-3">
          <h1 className="text-xl font-semibold">Recuperar contraseña</h1>
          <p className="text-sm text-muted-foreground">Cargando…</p>
        </div>
      }
    >
      <RecuperarPageInner />
    </Suspense>
  );
}
