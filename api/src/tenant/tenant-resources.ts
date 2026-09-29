/**
 * HTTP resource registries for IDOR / permission suites.
 *
 * - TENANT_RESOURCES: models in TENANT_MODELS (cross-tenant → 404).
 * - GLOBAL_RESOURCES: cluster-scoped resources. IDOR is permission-based
 *   (403 without permission), not cross-tenant 404. Institution is here —
 *   it is NOT a TENANT_MODEL and must not be added to TENANT_MODELS.
 */
export const TENANT_RESOURCES = [
  {
    model: 'Startup' as const,
    basePath: '/api/v1/startups',
    methods: ['GET', 'PATCH', 'DELETE'] as const,
    idor: 'tenant' as const,
  },
] as const;

export const GLOBAL_RESOURCES = [
  {
    model: 'Institution' as const,
    basePath: '/api/v1/institutions',
    methods: ['GET', 'PATCH', 'DELETE'] as const,
    /** Without permission → 403; no incubator scoping. */
    idor: 'permission' as const,
  },
  {
    model: 'GeoUnit' as const,
    basePath: '/api/v1/geo-units',
    methods: ['GET', 'PATCH', 'DELETE'] as const,
    /** Without permission → 403; geo is global (no incubator scoping). */
    idor: 'permission' as const,
  },
] as const;

export type TenantResource = (typeof TENANT_RESOURCES)[number];
export type GlobalResource = (typeof GLOBAL_RESOURCES)[number];

export const HTTP_RESOURCES = [
  ...TENANT_RESOURCES,
  ...GLOBAL_RESOURCES,
] as const;
