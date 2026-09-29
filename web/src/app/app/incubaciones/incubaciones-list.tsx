'use client';

import * as React from 'react';
import { z } from 'zod';
import { ResourceList } from '@/components/resource/resource-list';
import { type ColumnDef } from '@/components/ui/data-table';
import { apiClient, ProblemError } from '@/lib/api/client';

export type IncubationRow = {
  id: string;
  status: string;
  startedOn: string | null;
  endedOn: string | null;
  exitReason: string | null;
};

export type IncubationCreate = {
  status: string;
  startedOn: string;
  endedOn: string;
  exitReason: string;
};

const createSchema = z.object({
  status: z.string().min(1),
  startedOn: z.string(),
  endedOn: z.string(),
  exitReason: z.string(),
});

const columns: ColumnDef<IncubationRow>[] = [
  { accessorKey: 'status', header: 'Estado' },
  {
    accessorKey: 'startedOn',
    header: 'Inicio',
    cell: ({ row }) => row.original.startedOn ?? '—',
  },
  {
    accessorKey: 'endedOn',
    header: 'Fin',
    cell: ({ row }) => row.original.endedOn ?? '—',
  },
  {
    accessorKey: 'exitReason',
    header: 'Motivo de salida',
    cell: ({ row }) => row.original.exitReason ?? '—',
  },
];

function problemDetail(error: unknown): string {
  if (error instanceof ProblemError) {
    return error.detail;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export type IncubacionesListProps = {
  canEdit?: boolean;
};

export function IncubacionesList({ canEdit = true }: IncubacionesListProps) {
  const fetchPage = React.useCallback(async ({ page }: { page: number }) => {
    const result = await apiClient<{
      data: IncubationRow[];
      meta: { page: number; pageSize: number; total: number };
    }>(`/api/v1/incubations?page=${page}`);
    return result;
  }, []);

  return (
    <ResourceList<IncubationRow, IncubationCreate>
      title="Incubaciones"
      columns={columns}
      fetchPage={fetchPage}
      rowHref={(row) => `/app/incubaciones/${row.id}`}
      create={
        canEdit
          ? {
              title: 'Nueva incubación',
              triggerLabel: 'Crear',
              schema: createSchema,
              fields: [
                { name: 'status', label: 'Estado' },
                { name: 'startedOn', label: 'Inicio' },
                { name: 'endedOn', label: 'Fin' },
                { name: 'exitReason', label: 'Motivo de salida' },
              ],
              submitLabel: 'Guardar',
              onSubmit: async (value) => {
                try {
                  await apiClient('/api/v1/incubations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      status: value.status,
                      startedOn: value.startedOn || null,
                      endedOn: value.endedOn || null,
                      exitReason: value.exitReason || null,
                    }),
                  });
                } catch (error) {
                  throw new Error(problemDetail(error));
                }
              },
            }
          : undefined
      }
    />
  );
}
