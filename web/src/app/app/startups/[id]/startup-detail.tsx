'use client';

import * as React from 'react';
import { ResourceDetail } from '@/components/resource/resource-detail';
import { apiClient, NotFoundError } from '@/lib/api/client';

export type StartupDetailData = {
  id: string;
  name: string;
  domain: string;
  visibility: string;
};

export type StartupDetailProps = {
  startupId: string;
};

export function StartupDetail({ startupId }: StartupDetailProps) {
  const [startup, setStartup] = React.useState<StartupDetailData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient<StartupDetailData>(
          `/api/v1/startups/${startupId}`,
        );
        if (!cancelled) {
          setStartup(data);
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
  }, [startupId]);

  if (loading) {
    return <p>Cargando</p>;
  }

  if (error) {
    return (
      <ResourceDetail title="Startup" fields={[]} tabs={[]} error={error} />
    );
  }

  if (!startup) {
    return null;
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
          content: (
            <a href={`/app/startups/${startup.id}/metricas`}>Ver métricas</a>
          ),
        },
      ]}
    />
  );
}
