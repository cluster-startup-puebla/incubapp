'use client';

import * as React from 'react';
import { ResourceDetail } from '@/components/resource/resource-detail';
import { apiClient, NotFoundError } from '@/lib/api/client';

export type MyStartupData = {
  id: string;
  name: string;
  domain: string;
  visibility: string;
};

type ListEnvelope = {
  data: MyStartupData[];
  meta: { page: number; pageSize: number; total: number };
};

export function MyStartupPage() {
  const [startup, setStartup] = React.useState<MyStartupData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const list = await apiClient<ListEnvelope>(
          '/api/v1/startups?page=1&pageSize=1',
        );
        const mine = list.data[0];
        if (!mine) {
          if (!cancelled) {
            setStartup(null);
            setError('No encontrado');
          }
          return;
        }
        const detail = await apiClient<MyStartupData>(
          `/api/v1/startups/${mine.id}`,
        );
        if (!cancelled) {
          setStartup(detail);
        }
      } catch (err) {
        if (!cancelled) {
          setStartup(null);
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
  }, []);

  if (loading) {
    return <p>Cargando</p>;
  }

  if (error || !startup) {
    return (
      <ResourceDetail
        title="Mi startup"
        fields={[]}
        tabs={[]}
        error={error ?? 'No encontrado'}
      />
    );
  }

  return (
    <ResourceDetail
      title={startup.name}
      fields={[
        { label: 'Nombre', value: startup.name },
        { label: 'Dominio', value: startup.domain },
        { label: 'Visibilidad', value: startup.visibility },
      ]}
      tabs={[
        {
          value: 'metricas',
          name: 'Métricas',
          content: <a href="/app/mi-startup/metricas">Ver métricas</a>,
        },
      ]}
    />
  );
}
