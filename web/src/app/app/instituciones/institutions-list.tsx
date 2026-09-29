'use client';

import * as React from 'react';
import { z } from 'zod';
import { ResourceList } from '@/components/resource/resource-list';
import { apiClient } from '@/lib/api/client';

export type InstitutionRow = {
  id: string;
  name: string;
  countryCode: string;
  website: string | null;
};

export type CreateInstitutionValues = {
  name: string;
  countryCode: string;
  website: string;
};

export const createInstitutionSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  countryCode: z
    .string()
    .regex(/^[A-Za-z]{2}$/, 'countryCode must be 2 letters'),
  website: z.union([
    z.literal(''),
    z.string().url('website must be a valid URL'),
  ]),
});

const columns = [
  { accessorKey: 'name' as const, header: 'Nombre' },
  { accessorKey: 'countryCode' as const, header: 'País' },
  {
    accessorKey: 'website' as const,
    header: 'Sitio',
    cell: (info: { getValue: () => unknown }) => {
      const value = info.getValue() as string | null;
      return value ?? '';
    },
  },
];

export type InstitutionsListProps = {
  canCreate?: boolean;
};

export function InstitutionsList({ canCreate = false }: InstitutionsListProps) {
  const fetchPage = React.useCallback(async ({ page }: { page: number }) => {
    return apiClient<{
      data: InstitutionRow[];
      meta: { page: number; pageSize: number; total: number };
    }>(`/api/v1/institutions?page=${page}`);
  }, []);

  const create = canCreate
    ? {
        title: 'Nueva institución',
        triggerLabel: 'Crear',
        schema: createInstitutionSchema,
        fields: [
          { name: 'name' as const, label: 'Nombre' },
          { name: 'countryCode' as const, label: 'País' },
          { name: 'website' as const, label: 'Sitio' },
        ],
        submitLabel: 'Guardar',
        onSubmit: async (value: CreateInstitutionValues) => {
          const body: {
            name: string;
            countryCode: string;
            website?: string;
          } = {
            name: value.name,
            countryCode: value.countryCode.toUpperCase(),
          };
          if (value.website) {
            body.website = value.website;
          }
          await apiClient('/api/v1/institutions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
        },
      }
    : undefined;

  return (
    <ResourceList<InstitutionRow, CreateInstitutionValues>
      title="Instituciones"
      columns={columns}
      fetchPage={fetchPage}
      create={create}
      rowHref={(row) => `/app/instituciones/${row.id}`}
    />
  );
}
