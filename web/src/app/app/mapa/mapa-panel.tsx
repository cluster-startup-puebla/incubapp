'use client';

import * as React from 'react';
import { apiClient, ProblemError } from '@/lib/api/client';

export type MapFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: {
      id: string;
      name: string;
      slug: string;
    };
  }>;
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

export function MapaPanel() {
  const [features, setFeatures] = React.useState<
    MapFeatureCollection['features'] | null
  >(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setError(null);
      try {
        const body = await apiClient<MapFeatureCollection>(
          '/api/v1/analytics/map',
        );
        if (!cancelled) {
          setFeatures(body.features ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setFeatures(null);
          setError(errorDetail(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Mapa</h1>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {features && features.length === 0 ? (
        <p role="status">Mapa vacío: no hay incubadoras con coordenadas.</p>
      ) : null}
      {features && features.length > 0 ? (
        <ul className="space-y-2">
          {features.map((feature) => (
            <li key={feature.properties.id}>{feature.properties.name}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
