'use client';

import * as React from 'react';
import { z } from 'zod';
import { ResourceList } from '@/components/resource/resource-list';
import { type ColumnDef } from '@/components/ui/data-table';
import { apiClient, ProblemError } from '@/lib/api/client';

export type StartupRow = {
  id: string;
  name: string;
  domain: string;
  visibility: string;
};

export type StartupCreate = {
  name: string;
  domain: string;
  visibility: string;
};

const createSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
  visibility: z.enum(['PRIVATE', 'INCUBATOR', 'CLUSTER', 'PUBLIC']),
});

const columns: ColumnDef<StartupRow>[] = [
  { accessorKey: 'name', header: 'Nombre' },
  { accessorKey: 'domain', header: 'Dominio' },
  { accessorKey: 'visibility', header: 'Visibilidad' },
];

function formatProblem(error: ProblemError): string {
  const parts = [error.detail];
  if (error.candidates !== undefined) {
    parts.push(JSON.stringify(error.candidates));
  }
  return parts.filter(Boolean).join(' ');
}

export type StartupsListProps = {
  canCreate?: boolean;
};

export function StartupsList({ canCreate = true }: StartupsListProps) {
  const fetchPage = React.useCallback(async ({ page }: { page: number }) => {
    return apiClient<{
      data: StartupRow[];
      meta: { page: number; pageSize: number; total: number };
    }>(`/api/v1/startups?page=${page}`);
  }, []);

  return (
    <ResourceList<StartupRow, StartupCreate>
      title="Startups"
      columns={columns}
      fetchPage={fetchPage}
      rowHref={(row) => `/app/startups/${row.id}`}
      create={
        canCreate
          ? {
              title: 'Nueva startup',
              triggerLabel: 'Crear',
              schema: createSchema,
              fields: [
                { name: 'name', label: 'Nombre' },
                { name: 'domain', label: 'Dominio' },
                { name: 'visibility', label: 'Visibilidad' },
              ],
              submitLabel: 'Guardar',
              onSubmit: async (value) => {
                try {
                  await apiClient('/api/v1/startups', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(value),
                  });
                } catch (error) {
                  if (error instanceof ProblemError) {
                    throw new Error(formatProblem(error));
                  }
                  throw error;
                }
              },
            }
          : undefined
      }
    />
  );
}
