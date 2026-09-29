import type { TenantBrandConfig } from './brand';

type IncubatorListRow = {
  id: string;
  slug: string;
  brandPrimary: string | null;
};

type IncubatorDetail = {
  id: string;
  slug: string;
  brandPrimary: string | null;
  logoUrl: string | null;
};

/**
 * Cluster-wide incubator brand lookup. Does not send x-incubator-id:
 * list by slug, then GET by id for the signed logoUrl.
 */
export async function loadIncubatorBrand(
  slug: string,
): Promise<TenantBrandConfig | null> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    return null;
  }

  try {
    const listUrl = new URL('/api/v1/incubators', base);
    listUrl.searchParams.set('filter[slug][eq]', slug);

    const listRes = await fetch(listUrl.toString(), {
      credentials: 'include',
    });
    if (!listRes.ok) {
      return null;
    }

    const listBody = (await listRes.json()) as { data?: IncubatorListRow[] };
    const rows = Array.isArray(listBody.data) ? listBody.data : [];
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    if (!row || row.slug !== slug) {
      return null;
    }

    const detailRes = await fetch(`${base}/api/v1/incubators/${row.id}`, {
      credentials: 'include',
    });
    if (!detailRes.ok) {
      return null;
    }

    const detailBody = (await detailRes.json()) as { data?: IncubatorDetail };
    const detail = detailBody.data;
    if (!detail) {
      return null;
    }

    return {
      slug: row.slug,
      ...(typeof row.brandPrimary === 'string'
        ? { primary: row.brandPrimary }
        : {}),
      logoUrl: detail.logoUrl ?? null,
    };
  } catch {
    return null;
  }
}
