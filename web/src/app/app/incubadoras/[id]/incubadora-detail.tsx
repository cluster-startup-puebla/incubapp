'use client';

import * as React from 'react';
import { z } from 'zod';
import { ResourceDetail } from '@/components/resource/resource-detail';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient, ProblemError } from '@/lib/api/client';
import { TenantTheme } from '@/theme/tenant-theme';
import { usePortalBrand } from '../../portal-brand';

export type IncubatorDetail = {
  id: string;
  name: string;
  slug: string;
  brandPrimary: string | null;
  logoUrl: string | null;
  version?: number;
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

export const editIncubatorFormSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  slug: slugSchema,
  brandPrimary: brandPrimarySchema,
});

export type EditIncubatorForm = z.infer<typeof editIncubatorFormSchema>;

const RELOAD_MESSAGE = 'Recarga la ficha';

export type IncubadoraDetailProps = {
  id: string;
  canEdit?: boolean;
  incubatorId?: string | null;
};

export function IncubadoraDetail({
  id,
  canEdit = true,
  incubatorId = null,
}: IncubadoraDetailProps) {
  const [data, setData] = React.useState<IncubatorDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const portal = usePortalBrand();

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const row = await apiClient<IncubatorDetail>(`/api/v1/incubators/${id}`, {
        incubatorId,
      });
      setData(row);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [id, incubatorId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (data?.slug) {
      portal?.setSlug(data.slug);
    }
  }, [data?.slug, portal]);

  async function handleEdit(value: EditIncubatorForm) {
    if (data?.version == null) {
      throw new Error(RELOAD_MESSAGE);
    }

    const body: {
      name: string;
      slug: string;
      brandPrimary?: string | null;
    } = {
      name: value.name,
      slug: value.slug,
    };
    if (value.brandPrimary !== undefined) {
      body.brandPrimary = value.brandPrimary;
    }

    await apiClient(`/api/v1/incubators/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': String(data.version),
      },
      body: JSON.stringify(body),
      incubatorId,
    });
    await load();
    portal?.bump();
  }

  async function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setLogoError(null);

    if (data?.version == null) {
      setLogoError(RELOAD_MESSAGE);
      return;
    }

    const form = new FormData();
    form.append('file', file);

    try {
      await apiClient(`/api/v1/incubators/${id}/logo`, {
        method: 'POST',
        headers: {
          'If-Match': String(data.version),
        },
        body: form,
        incubatorId,
      });
      await load();
      portal?.bump();
    } catch (err) {
      if (err instanceof ProblemError) {
        setLogoError(err.detail);
      } else {
        setLogoError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  if (isLoading && !data && !error) {
    return <p>Cargando</p>;
  }

  const versionMissing = data != null && data.version == null;

  return (
    <TenantTheme
      slug={data?.slug ?? null}
      revision={portal?.revision ?? 0}
      showLogo={false}
    >
      <div className="space-y-4">
        {data?.logoUrl ? <img src={data.logoUrl} alt="" /> : null}
        <ResourceDetail
          title={data?.name ?? 'Incubadora'}
          fields={[
            { label: 'Nombre', value: data?.name ?? null },
            { label: 'Slug', value: data?.slug ?? null },
            { label: 'Color', value: data?.brandPrimary ?? null },
          ]}
          tabs={[]}
          error={error}
          edit={
            canEdit && data && !error
              ? {
                  title: 'Editar incubadora',
                  triggerLabel: 'Editar',
                  schema: editIncubatorFormSchema,
                  fields: [
                    { name: 'name', label: 'Nombre' },
                    { name: 'slug', label: 'Slug' },
                    { name: 'brandPrimary', label: 'Color' },
                  ],
                  submitLabel: 'Guardar',
                  defaultValues: {
                    name: data.name,
                    slug: data.slug,
                    brandPrimary: data.brandPrimary ?? '',
                  },
                  onSubmit: handleEdit,
                }
              : undefined
          }
        />
        {canEdit && data && !error ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="incubator-logo">Logo</Label>
            <Input
              id="incubator-logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleLogoChange}
            />
            {logoError || versionMissing ? (
              <p className="text-sm text-destructive" role="alert">
                {logoError ?? RELOAD_MESSAGE}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </TenantTheme>
  );
}
