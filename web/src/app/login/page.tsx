'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { portalPath, type SessionUser } from '@/app/app/session-roles';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const { data, error: signInError } = await authClient.signIn.email({
      email: String(form.get('email') ?? '').trim(),
      password: String(form.get('password') ?? '').trim(),
    });
    setPending(false);

    if (signInError) {
      setError(signInError.message ?? 'No se pudo iniciar sesión');
      return;
    }

    router.push(portalPath(data?.user as SessionUser | undefined));
    router.refresh();
  }

  return (
    <form method="post" onSubmit={onSubmit} className="grid max-w-sm gap-3">
      <h1 className="text-xl font-semibold">Entrar</h1>
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
      <div className="grid gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        Entrar
      </Button>
      <p className="text-sm text-muted-foreground">
        <Link href="/recuperar" className="underline-offset-4 hover:underline">
          Recuperar contraseña
        </Link>
      </p>
    </form>
  );
}
