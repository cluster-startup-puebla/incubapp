'use client';

import * as React from 'react';
import { z } from 'zod';
import {
  ResourceList,
  type FetchPageResult,
} from '@/components/resource/resource-list';
import { apiClient } from '@/lib/api/client';

export type GeoUnitRow = {
  id: string;
  name: string;
  code: string;
  level: string;
  parentId: string | null;
};

const createSchema = z.object({
  level: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  parentId: z.string().min(1),
});

type CreateGeoUnit = z.infer<typeof createSchema>;

const columns = [
  { accessorKey: 'name' as const, header: 'Nombre' },
  { accessorKey: 'code' as const, header: 'Código' },
  { accessorKey: 'level' as const, header: 'Nivel' },
];

export type GeoListProps = {
  parentId: string;
  /** When true, superadmin (or shell) may create. Default false until the shell passes it. */
  canCreate?: boolean;
};

export function GeoList({ parentId, canCreate = false }: GeoListProps) {
  const fetchPage = React.useCallback(
    async ({
      page,
    }: {
      page: number;
    }): Promise<FetchPageResult<GeoUnitRow>> => {
      return apiClient<FetchPageResult<GeoUnitRow>>(
        `/api/v1/geo-units/${parentId}/children?page=${page}`,
      );
    },
    [parentId],
  );

  const handleCreate = React.useCallback(async (value: CreateGeoUnit) => {
    await apiClient('/api/v1/geo-units', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
  }, []);

  const rowHref = React.useCallback(
    (row: GeoUnitRow) => `/app/geo?parentId=${row.id}`,
    [],
  );

  return (
    <ResourceList<GeoUnitRow, CreateGeoUnit>
      title="Geografía"
      columns={columns}
      fetchPage={fetchPage}
      rowHref={rowHref}
      create={
        canCreate
          ? {
              title: 'Nueva unidad',
              triggerLabel: 'Crear',
              schema: createSchema,
              fields: [
                { name: 'level', label: 'Nivel' },
                { name: 'code', label: 'Código' },
                { name: 'name', label: 'Nombre' },
                { name: 'parentId', label: 'Padre' },
              ],
              submitLabel: 'Guardar',
              defaultValues: { parentId },
              onSubmit: handleCreate,
            }
          : undefined
      }
    />
  );
}
