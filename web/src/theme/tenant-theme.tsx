'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { loadTenantBrand, type TenantBrandConfig, brandToStyle } from './brand';
import { brandSource } from './brand-source';

export function TenantTheme({
  slug,
  children,
}: {
  slug: string | null;
  children: ReactNode;
}) {
  const [brand, setBrand] = useState<TenantBrandConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadTenantBrand(slug, brandSource).then((next) => {
      if (!cancelled) {
        setBrand(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div
      data-tenant={slug ?? 'default'}
      style={brandToStyle(brand)}
      className="min-h-screen bg-background text-foreground"
    >
      {children}
    </div>
  );
}
