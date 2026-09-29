'use client';

import * as React from 'react';
import { ResourceDetail } from '@/components/resource/resource-detail';
import { apiClient, NotFoundError } from '@/lib/api/client';

export type UsuarioDetailData = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UsuarioDetailProps = {
  userId: string;
};

export function UsuarioDetail({ userId }: UsuarioDetailProps) {
  const [user, setUser] = React.useState<UsuarioDetailData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient<UsuarioDetailData>(
          `/api/v1/users/${userId}`,
        );
        if (!cancelled) {
          setUser(data);
        }
      } catch (err) {
        if (!cancelled) {
          setUser(null);
          if (err instanceof NotFoundError) {
            setError('No encontrado');
          } else {
            setError(err instanceof Error ? err.message : String(err));
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return <p>Cargando</p>;
  }

  if (error) {
    return (
      <ResourceDetail title="Usuario" fields={[]} tabs={[]} error={error} />
    );
  }

  if (!user) {
    return null;
  }

  return (
    <ResourceDetail
      title={user.name || user.email}
      fields={[
        { label: 'Email', value: user.email },
        { label: 'Nombre', value: user.name },
        { label: 'Verificado', value: user.emailVerified ? 'Sí' : 'No' },
        { label: 'Creado', value: user.createdAt },
      ]}
      tabs={[]}
    />
  );
}
