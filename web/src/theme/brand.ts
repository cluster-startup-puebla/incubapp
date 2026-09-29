export type TenantBrandConfig = {
  slug: string;
  primary?: string;
  primaryForeground?: string;
  accent?: string;
  accentForeground?: string;
  ring?: string;
  logoUrl: string | null;
};

export type TenantBrandSource = {
  load(slug: string): Promise<TenantBrandConfig | null>;
};

const TOKEN_MAP = {
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  accent: '--accent',
  accentForeground: '--accent-foreground',
  ring: '--ring',
} as const;

type BrandColorKey = keyof typeof TOKEN_MAP;

const COLOR_VALUE =
  /^(#[0-9a-fA-F]{3,8}|oklch\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\)|rgb\([^)]+\)|rgba\([^)]+\)|[a-zA-Z]+)$/;

export function brandToStyle(
  brand: TenantBrandConfig | null,
): Record<string, string> {
  if (!brand) {
    return {};
  }

  const style: Record<string, string> = {};
  for (const key of Object.keys(TOKEN_MAP) as BrandColorKey[]) {
    const value = brand[key];
    if (typeof value === 'string' && COLOR_VALUE.test(value)) {
      style[TOKEN_MAP[key]] = value;
    }
  }
  return style;
}

export async function loadTenantBrand(
  slug: string | null | undefined,
  source: TenantBrandSource,
): Promise<TenantBrandConfig | null> {
  if (!slug) {
    return null;
  }

  try {
    const brand = await source.load(slug);
    if (!brand || brand.slug !== slug) {
      return null;
    }
    return brand;
  } catch {
    return null;
  }
}
