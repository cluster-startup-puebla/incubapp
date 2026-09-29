'use client';

import * as React from 'react';
import { MetricsPanel } from '@/app/app/startups/[id]/metricas/metrics-panel';
import { apiClient, NotFoundError } from '@/lib/api/client';

type StartupRow = { id: string };

type ListEnvelope = {
  data: StartupRow[];
  meta: { page: number; pageSize: number; total: number };
};

export type MyStartupMetricsPageProps = {
  canVerify?: boolean;
};

export function MyStartupMetricsPage({
  canVerify = false,
}: MyStartupMetricsPageProps) {
  const [startupId, setStartupId] = React.useState<string | null>(null);
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
            setError('No encontrado');
          }
          return;
        }
        if (!cancelled) {
          setStartupId(mine.id);
        }
      } catch (err) {
        if (!cancelled) {
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

  if (error || !startupId) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error ?? 'No encontrado'}
      </p>
    );
  }

  return <MetricsPanel startupId={startupId} canVerify={canVerify} />;
}
