'use client';

import * as React from 'react';
import { z } from 'zod';
import { ResourceList } from '@/components/resource/resource-list';
import { apiClient } from '@/lib/api/client';

export type FrameworkRow = {
  id: string;
  name: string;
  status: 'DRAFT' | 'PUBLISHED';
  majorVersion: number;
};

export type CreateFrameworkValues = {
  name: string;
};

export const createFrameworkSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
});

const columns = [
  { accessorKey: 'name' as const, header: 'Nombre' },
  { accessorKey: 'status' as const, header: 'Estado' },
  { accessorKey: 'majorVersion' as const, header: 'Versión' },
];

export type FrameworksListProps = {
  canCreate?: boolean;
};

export function FrameworksList({ canCreate = false }: FrameworksListProps) {
  const fetchPage = React.useCallback(async ({ page }: { page: number }) => {
    return apiClient<{
      data: FrameworkRow[];
      meta: { page: number; pageSize: number; total: number };
    }>(`/api/v1/frameworks?page=${page}`);
  }, []);

  const create = canCreate
    ? {
        title: 'Nuevo borrador',
        triggerLabel: 'Crear',
        schema: createFrameworkSchema,
        fields: [{ name: 'name' as const, label: 'Nombre' }],
        submitLabel: 'Guardar',
        onSubmit: async (value: CreateFrameworkValues) => {
          await apiClient('/api/v1/frameworks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: value.name }),
          });
        },
      }
    : undefined;

  return (
    <ResourceList<FrameworkRow, CreateFrameworkValues>
      title="Frameworks"
      columns={columns}
      fetchPage={fetchPage}
      create={create}
      rowHref={(row) => `/app/frameworks/${row.id}`}
    />
  );
}
