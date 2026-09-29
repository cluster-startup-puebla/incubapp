'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { ResourceDetail } from '@/components/resource/resource-detail';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api/client';

export type Framework = {
  id: string;
  name: string;
  status: 'DRAFT' | 'PUBLISHED';
  majorVersion: number;
  version: number;
  stages?: { id: string; name: string; sortOrder: number }[];
};

export type FrameworkDetailProps = {
  id: string;
  canPublish?: boolean;
  canEdit?: boolean;
};

const editSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
});

type EditValues = z.infer<typeof editSchema>;

export function FrameworkDetail({
  id,
  canPublish = false,
  canEdit = false,
}: FrameworkDetailProps) {
  const router = useRouter();
  const [framework, setFramework] = React.useState<Framework | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [pending, setPending] = React.useState(false);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const row = await apiClient<Framework>(`/api/v1/frameworks/${id}`);
      setFramework(row);
    } catch (err) {
      setFramework(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handlePublish() {
    if (pending) return;
    setPending(true);
    setActionError(null);
    try {
      await apiClient(`/api/v1/frameworks/${id}/publish`, { method: 'POST' });
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function handleClone() {
    if (pending) return;
    setPending(true);
    setActionError(null);
    try {
      const cloned = await apiClient<Framework>(
        `/api/v1/frameworks/${id}/clone`,
        { method: 'POST' },
      );
      router.push(`/app/frameworks/${cloned.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  if (isLoading) {
    return <p>Cargando</p>;
  }

  return (
    <div className="space-y-4">
      {canPublish && framework ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void handlePublish()}
            disabled={pending || framework.status === 'PUBLISHED'}
          >
            Publicar
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleClone()}
            disabled={pending}
          >
            Clonar
          </Button>
        </div>
      ) : null}
      {actionError ? (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}
      <ResourceDetail
        title={framework?.name ?? 'Framework'}
        fields={[
          { label: 'Nombre', value: framework?.name ?? null },
          { label: 'Estado', value: framework?.status ?? null },
          {
            label: 'Versión',
            value:
              framework?.majorVersion != null
                ? String(framework.majorVersion)
                : null,
          },
        ]}
        tabs={
          framework
            ? [
                {
                  value: 'etapas',
                  name: 'Etapas',
                  content: (
                    <ul className="space-y-1 text-sm">
                      {(framework.stages ?? []).map((stage) => (
                        <li key={stage.id}>
                          {stage.sortOrder}. {stage.name}
                        </li>
                      ))}
                      {(framework.stages ?? []).length === 0 ? (
                        <li className="text-muted-foreground">Sin etapas</li>
                      ) : null}
                    </ul>
                  ),
                },
              ]
            : []
        }
        error={error}
        edit={
          canEdit && framework
            ? {
                title: 'Editar framework',
                triggerLabel: 'Editar',
                schema: editSchema,
                fields: [{ name: 'name', label: 'Nombre' }],
                submitLabel: 'Guardar',
                defaultValues: { name: framework.name },
                onSubmit: async (value: EditValues) => {
                  await apiClient(`/api/v1/frameworks/${id}`, {
                    method: 'PATCH',
                    headers: {
                      'Content-Type': 'application/json',
                      'If-Match': String(framework.version),
                    },
                    body: JSON.stringify({ name: value.name }),
                  });
                  await load();
                },
              }
            : undefined
        }
      />
    </div>
  );
}
