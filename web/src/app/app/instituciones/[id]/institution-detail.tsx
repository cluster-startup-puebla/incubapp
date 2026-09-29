'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { ResourceDetail } from '@/components/resource/resource-detail';
import { FormSheet } from '@/components/resource/form-sheet';
import { apiClient } from '@/lib/api/client';

export type Institution = {
  id: string;
  name: string;
  countryCode: string;
  website: string | null;
  version: number;
};

export type InstitutionDetailProps = {
  id: string;
  canEdit?: boolean;
  canDelete?: boolean;
};

const editSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  countryCode: z
    .string()
    .regex(/^[A-Za-z]{2}$/, 'countryCode must be 2 letters'),
  website: z.union([
    z.literal(''),
    z.string().url('website must be a valid URL'),
  ]),
});

type EditValues = z.infer<typeof editSchema>;

const deleteSchema = z.object({});

export function InstitutionDetail({
  id,
  canEdit = false,
  canDelete = false,
}: InstitutionDetailProps) {
  const router = useRouter();
  const [institution, setInstitution] = React.useState<Institution | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const row = await apiClient<Institution>(`/api/v1/institutions/${id}`);
      setInstitution(row);
    } catch (err) {
      setInstitution(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return <p>Cargando</p>;
  }

  return (
    <div className="space-y-4">
      <ResourceDetail
        title={institution?.name ?? 'Institución'}
        fields={[
          { label: 'Nombre', value: institution?.name ?? null },
          { label: 'País', value: institution?.countryCode ?? null },
          { label: 'Sitio', value: institution?.website ?? null },
        ]}
        tabs={
          institution
            ? [
                {
                  value: 'info',
                  name: 'Info',
                  content: (
                    <p className="text-sm text-muted-foreground">
                      Ficha de la institución.
                    </p>
                  ),
                },
              ]
            : []
        }
        error={error}
        edit={
          canEdit && institution
            ? {
                title: 'Editar institución',
                triggerLabel: 'Editar',
                schema: editSchema,
                fields: [
                  { name: 'name', label: 'Nombre' },
                  { name: 'countryCode', label: 'País' },
                  { name: 'website', label: 'Sitio' },
                ],
                submitLabel: 'Guardar',
                defaultValues: {
                  name: institution.name,
                  countryCode: institution.countryCode,
                  website: institution.website ?? '',
                },
                onSubmit: async (value: EditValues) => {
                  const body: {
                    name: string;
                    countryCode: string;
                    website?: string | null;
                  } = {
                    name: value.name,
                    countryCode: value.countryCode.toUpperCase(),
                    website: value.website ? value.website : null,
                  };
                  await apiClient(`/api/v1/institutions/${id}`, {
                    method: 'PATCH',
                    headers: {
                      'Content-Type': 'application/json',
                      'If-Match': String(institution.version),
                    },
                    body: JSON.stringify(body),
                  });
                  await load();
                },
              }
            : undefined
        }
      />
      {canDelete && institution ? (
        <FormSheet
          title="Eliminar institución"
          triggerLabel="Eliminar"
          schema={deleteSchema}
          fields={[]}
          submitLabel="Eliminar"
          destructive
          onSubmit={async () => {
            await apiClient(`/api/v1/institutions/${id}`, {
              method: 'DELETE',
            });
            router.push('/app/instituciones');
          }}
        />
      ) : null}
    </div>
  );
}
