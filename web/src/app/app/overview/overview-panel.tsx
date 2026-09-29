'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient, ProblemError } from '@/lib/api/client';

export type AnalyticsOverview = {
  incubators: number;
  stages: number;
  startups: number;
  funnel: {
    applied: number;
    active: number;
    graduated: number;
    dropped: number;
  };
};

function errorDetail(error: unknown): string {
  if (error instanceof ProblemError) {
    return error.detail;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function OverviewPanel() {
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [overview, setOverview] = React.useState<AnalyticsOverview | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const load = React.useCallback(async (nextFrom: string, nextTo: string) => {
    setPending(true);
    setError(null);
    setOverview(null);
    try {
      const params = new URLSearchParams();
      if (nextFrom) {
        params.set('from', nextFrom);
      }
      if (nextTo) {
        params.set('to', nextTo);
      }
      const qs = params.toString();
      const path = qs
        ? `/api/v1/analytics/overview?${qs}`
        : '/api/v1/analytics/overview';
      const data = await apiClient<AnalyticsOverview>(path);
      setOverview(data);
    } catch (err) {
      setOverview(null);
      setError(errorDetail(err));
    } finally {
      setPending(false);
    }
  }, []);

  React.useEffect(() => {
    void load('', '');
  }, [load]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await load(from, to);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="from">Desde</Label>
          <Input
            id="from"
            name="from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="to">Hasta</Label>
          <Input
            id="to"
            name="to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={pending}>
          Aplicar
        </Button>
      </form>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {overview ? (
        <div className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-muted-foreground">Incubadoras</dt>
              <dd data-testid="overview-incubators">{overview.incubators}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Etapas</dt>
              <dd data-testid="overview-stages">{overview.stages}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Startups</dt>
              <dd data-testid="overview-startups">{overview.startups}</dd>
            </div>
          </dl>
          <div>
            <h2 className="text-lg font-medium">Embudo</h2>
            <dl className="mt-2 grid gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-sm text-muted-foreground">Aplicadas</dt>
                <dd data-testid="funnel-applied">{overview.funnel.applied}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Activas</dt>
                <dd data-testid="funnel-active">{overview.funnel.active}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Graduadas</dt>
                <dd data-testid="funnel-graduated">
                  {overview.funnel.graduated}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Bajas</dt>
                <dd data-testid="funnel-dropped">{overview.funnel.dropped}</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}
