'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const { error: signUpError } = await authClient.signUp.email({
      name: String(form.get('name')),
      email: String(form.get('email')),
      password: String(form.get('password')),
    });
    setPending(false);

    if (signUpError) {
      setError(signUpError.message ?? 'No se pudo crear la cuenta');
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-sm gap-3">
      <h1 className="text-xl font-semibold">Registro</h1>
      <div className="grid gap-1.5">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" type="text" required autoComplete="name" />
      </div>
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
          minLength={10}
          autoComplete="new-password"
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        Crear cuenta
      </Button>
    </form>
  );
}
