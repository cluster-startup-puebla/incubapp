import { loadIncubatorBrand } from './api-brand-source';
import type { TenantBrandSource } from './brand';

/**
 * Live brand source: loads primary color and signed logo from the incubators API.
 */
export const brandSource: TenantBrandSource = {
  load(slug) {
    return loadIncubatorBrand(slug);
  },
};
