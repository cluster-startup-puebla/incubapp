'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { error: signUpError } = await authClient.signUp.email({
      name: String(form.get('name')),
      email: String(form.get('email')),
      password: String(form.get('password')),
    });

    if (signUpError) {
      setError(signUpError.message ?? 'No se pudo crear la cuenta');
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      <h1>Registro</h1>
      <label>
        Nombre
        <input name="name" type="text" required autoComplete="name" />
      </label>
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
          autoComplete="new-password"
        />
      </label>
      {error ? <p>{error}</p> : null}
      <button type="submit">Crear cuenta</button>
    </form>
  );
}
