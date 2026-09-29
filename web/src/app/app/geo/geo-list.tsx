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

const childSchema = z.object({
  level: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  parentId: z.string().min(1),
});

const countrySchema = z.object({
  level: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
});

type CreateChild = z.infer<typeof childSchema>;
type CreateCountry = z.infer<typeof countrySchema>;

const columns = [
  { accessorKey: 'name' as const, header: 'Nombre' },
  { accessorKey: 'code' as const, header: 'Código' },
  { accessorKey: 'level' as const, header: 'Nivel' },
];

export type GeoListProps = {
  parentId?: string | null;
  /** Superadmin only. The page passes this from the session. */
  canCreate?: boolean;
};

export function GeoList({ parentId = null, canCreate = false }: GeoListProps) {
  const fetchPage = React.useCallback(
    async ({
      page,
    }: {
      page: number;
    }): Promise<FetchPageResult<GeoUnitRow>> => {
      if (parentId) {
        return apiClient<FetchPageResult<GeoUnitRow>>(
          `/api/v1/geo-units/${parentId}/children?page=${page}`,
        );
      }

      const params = new URLSearchParams({ page: String(page) });
      params.set('filter[level][eq]', 'COUNTRY');
      return apiClient<FetchPageResult<GeoUnitRow>>(
        `/api/v1/geo-units?${params.toString()}`,
      );
    },
    [parentId],
  );

  const postUnit = React.useCallback(
    async (value: CreateChild | CreateCountry) => {
      await apiClient('/api/v1/geo-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
    },
    [],
  );

  const rowHref = React.useCallback(
    (row: GeoUnitRow) => `/app/geo?parentId=${row.id}`,
    [],
  );

  if (!parentId) {
    return (
      <ResourceList<GeoUnitRow, CreateCountry>
        title="Geografía"
        columns={columns}
        fetchPage={fetchPage}
        rowHref={rowHref}
        create={
          canCreate
            ? {
                title: 'Nuevo país',
                triggerLabel: 'Crear',
                schema: countrySchema,
                fields: [
                  { name: 'level', label: 'Nivel' },
                  { name: 'code', label: 'Código' },
                  { name: 'name', label: 'Nombre' },
                ],
                submitLabel: 'Guardar',
                defaultValues: { level: 'COUNTRY' },
                onSubmit: postUnit,
              }
            : undefined
        }
      />
    );
  }

  return (
    <ResourceList<GeoUnitRow, CreateChild>
      title="Geografía"
      columns={columns}
      fetchPage={fetchPage}
      rowHref={rowHref}
      create={
        canCreate
          ? {
              title: 'Nueva unidad',
              triggerLabel: 'Crear',
              schema: childSchema,
              fields: [
                { name: 'level', label: 'Nivel' },
                { name: 'code', label: 'Código' },
                { name: 'name', label: 'Nombre' },
                { name: 'parentId', label: 'Padre' },
              ],
              submitLabel: 'Guardar',
              defaultValues: { parentId },
              onSubmit: postUnit,
            }
          : undefined
      }
    />
  );
}
