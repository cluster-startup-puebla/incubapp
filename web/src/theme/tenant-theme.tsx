'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { loadTenantBrand, type TenantBrandConfig, brandToStyle } from './brand';
import { brandSource } from './brand-source';

export function TenantTheme({
  slug,
  revision = 0,
  showLogo = true,
  children,
}: {
  slug: string | null;
  revision?: number;
  showLogo?: boolean;
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
  }, [slug, revision]);

  return (
    <div
      data-tenant={slug ?? 'default'}
      style={brandToStyle(brand)}
      className="min-h-screen bg-background text-foreground"
    >
      {showLogo && brand?.logoUrl ? <img src={brand.logoUrl} alt="" /> : null}
      {children}
    </div>
  );
}
