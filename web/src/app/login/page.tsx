'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { error: signInError } = await authClient.signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
    });

    if (signInError) {
      setError(signInError.message ?? 'No se pudo iniciar sesión');
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      <h1>Entrar</h1>
      <label>
        Email
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
        />
      </label>
      {error ? <p>{error}</p> : null}
      <button type="submit">Entrar</button>
    </form>
  );
}
