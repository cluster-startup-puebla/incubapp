'use client';

import * as React from 'react';
import { z } from 'zod';
import { FormSheet } from '@/components/resource/form-sheet';
import { Button } from '@/components/ui/button';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { apiClient, ProblemError } from '@/lib/api/client';

export type MetricReadingRow = {
  id: string;
  metricDefId: string;
  period: string;
  value: number;
  verifiedAt: string | null;
};

export type MetricCreate = {
  metricDefId: string;
  period: string;
  value: number;
};

const createSchema = z.object({
  metricDefId: z.string().min(1),
  period: z.string().min(1),
  value: z.number().finite(),
});

export type MetricsPanelProps = {
  startupId: string;
  canVerify?: boolean;
};

function problemDetail(error: unknown): string {
  if (error instanceof ProblemError) {
    return error.detail;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function MetricsPanel({
  startupId,
  canVerify = false,
}: MetricsPanelProps) {
  const [data, setData] = React.useState<MetricReadingRow[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [cursor, setCursor] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (next: string | null) => {
      setIsLoading(true);
      setError(null);
      try {
        const qs = next ? `?cursor=${encodeURIComponent(next)}` : '';
        const result = await apiClient<{
          data: MetricReadingRow[];
          meta: { pageSize: number; nextCursor?: string | null };
        }>(`/api/v1/startups/${startupId}/metrics${qs}`);
        setData(result.data);
        setNextCursor(result.meta.nextCursor ?? null);
      } catch (err) {
        setData([]);
        setNextCursor(null);
        setError(problemDetail(err));
      } finally {
        setIsLoading(false);
      }
    },
    [startupId],
  );

  React.useEffect(() => {
    void load(cursor);
  }, [load, cursor]);

  async function handleCreate(value: MetricCreate) {
    const key = crypto.randomUUID();
    try {
      await apiClient(`/api/v1/startups/${startupId}/metrics`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify(value),
      });
      setCursor(null);
      await load(null);
    } catch (err) {
      throw new Error(problemDetail(err));
    }
  }

  async function handleVerify(id: string) {
    setError(null);
    try {
      await apiClient(`/api/v1/startups/${startupId}/metrics/${id}/verify`, {
        method: 'POST',
      });
      await load(cursor);
    } catch (err) {
      setError(problemDetail(err));
    }
  }

  const columns: ColumnDef<MetricReadingRow>[] = [
    { accessorKey: 'metricDefId', header: 'Métrica' },
    { accessorKey: 'period', header: 'Periodo' },
    { accessorKey: 'value', header: 'Valor' },
    {
      accessorKey: 'verifiedAt',
      header: 'Verificada',
      cell: ({ row }) => row.original.verifiedAt ?? '—',
    },
  ];

  if (canVerify) {
    columns.push({
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) =>
        row.original.verifiedAt ? null : (
          <Button
            type="button"
            size="sm"
            onClick={() => void handleVerify(row.original.id)}
          >
            Verificar
          </Button>
        ),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Métricas</h1>
        <FormSheet<MetricCreate>
          title="Nueva métrica"
          triggerLabel="Cargar"
          schema={createSchema}
          fields={[
            { name: 'metricDefId', label: 'Métrica' },
            { name: 'period', label: 'Periodo' },
            { name: 'value', label: 'Valor', type: 'number' },
          ]}
          submitLabel="Guardar"
          onSubmit={handleCreate}
        />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <DataTable
        data={data}
        columns={columns}
        isLoading={isLoading}
        pagination="cursor"
        nextCursor={nextCursor}
        onNextCursor={(value) => setCursor(value)}
      />
    </div>
  );
}
