'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type PortalBrandContextValue = {
  slug: string | null;
  revision: number;
  setSlug: (slug: string | null) => void;
  bump: () => void;
};

const PortalBrandContext = createContext<PortalBrandContextValue | null>(null);

export function PortalBrandProvider({ children }: { children: ReactNode }) {
  const [slug, setSlugState] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const setSlug = useCallback((next: string | null) => {
    setSlugState((current) => (current === next ? current : next));
  }, []);

  const bump = useCallback(() => {
    setRevision((current) => current + 1);
  }, []);

  const value = useMemo(
    () => ({ slug, revision, setSlug, bump }),
    [slug, revision, setSlug, bump],
  );

  return (
    <PortalBrandContext.Provider value={value}>
      {children}
    </PortalBrandContext.Provider>
  );
}

export function usePortalBrand(): PortalBrandContextValue | null {
  return useContext(PortalBrandContext);
}
