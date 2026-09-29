import type { TenantBrandSource } from './brand';

/**
 * Live source until an external provider (or the incubator record) supplies
 * colors. Returning null keeps the default :root palette.
 */
export const brandSource: TenantBrandSource = {
  load() {
    return Promise.resolve(null);
  },
};
