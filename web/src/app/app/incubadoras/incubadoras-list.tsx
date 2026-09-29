'use client';

import { z } from 'zod';
import { ResourceList } from '@/components/resource/resource-list';
import { apiClient } from '@/lib/api/client';

export type IncubatorListRow = {
  id: string;
  name: string;
  slug: string;
  brandPrimary: string | null;
};

const slugSchema = z
  .string()
  .min(1, 'Slug requerido')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case');

const brandPrimarySchema = z
  .string()
  .transform((value) => (value.trim() === '' ? undefined : value))
  .pipe(
    z
      .string()
      .regex(
        /^(#[0-9a-fA-F]{3,8}|oklch\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\)|rgb\([^)]+\)|rgba\([^)]+\)|[a-zA-Z]+)$/,
        'brandPrimary must be a CSS color',
      )
      .optional(),
  );

export const createIncubatorFormSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  slug: slugSchema,
  brandPrimary: brandPrimarySchema,
});

export type CreateIncubatorForm = z.infer<typeof createIncubatorFormSchema>;

const columns = [
  { accessorKey: 'name' as const, header: 'Nombre' },
  { accessorKey: 'slug' as const, header: 'Slug' },
  {
    accessorKey: 'brandPrimary' as const,
    header: 'Color',
    cell: (info: { getValue: () => unknown }) => {
      const value = info.getValue();
      return typeof value === 'string' ? value : '—';
    },
  },
];

export type IncubadorasListProps = {
  canCreate?: boolean;
  incubatorId?: string | null;
};

export function IncubadorasList({
  canCreate = true,
  incubatorId = null,
}: IncubadorasListProps) {
  async function fetchPage({ page }: { page: number }) {
    return apiClient<{
      data: IncubatorListRow[];
      meta: { page: number; pageSize: number; total: number };
    }>(`/api/v1/incubators?page=${page}&pageSize=10`, { incubatorId });
  }

  async function handleCreate(value: CreateIncubatorForm) {
    const body: {
      name: string;
      slug: string;
      brandPrimary?: string;
    } = {
      name: value.name,
      slug: value.slug,
    };
    if (value.brandPrimary) {
      body.brandPrimary = value.brandPrimary;
    }

    await apiClient('/api/v1/incubators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      incubatorId,
    });
  }

  return (
    <ResourceList<IncubatorListRow, CreateIncubatorForm>
      title="Incubadoras"
      columns={columns}
      fetchPage={fetchPage}
      rowHref={(row) => `/app/incubadoras/${row.id}`}
      create={
        canCreate
          ? {
              title: 'Nueva incubadora',
              triggerLabel: 'Crear',
              schema: createIncubatorFormSchema,
              fields: [
                { name: 'name', label: 'Nombre' },
                { name: 'slug', label: 'Slug' },
                { name: 'brandPrimary', label: 'Color' },
              ],
              submitLabel: 'Guardar',
              onSubmit: handleCreate,
            }
          : undefined
      }
    />
  );
}
