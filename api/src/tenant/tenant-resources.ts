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
  {
    model: 'Incubator' as const,
    basePath: '/api/v1/incubators',
    methods: ['GET', 'PATCH', 'DELETE'] as const,
    /**
     * Tenant root: not in TENANT_MODELS. Cross-scope access for directors
     * is enforced in the service via membership scopeId → 404.
     */
    idor: 'scope' as const,
  },
  {
    model: 'Membership' as const,
    basePath: '/api/v1/memberships',
    methods: ['GET', 'DELETE'] as const,
    /**
     * Cross-scope access for directors enforced in MembershipsHttpService
     * via ALS incubatorId → 404.
     */
    idor: 'scope' as const,
  },
  {
    model: 'Framework' as const,
    basePath: '/api/v1/frameworks',
    methods: ['GET', 'PATCH', 'DELETE'] as const,
    /** Without permission → 403; frameworks are global (no incubator scoping). */
    idor: 'permission' as const,
  },
] as const;

export type TenantResource = (typeof TENANT_RESOURCES)[number];
export type GlobalResource = (typeof GLOBAL_RESOURCES)[number];

export const HTTP_RESOURCES = [
  ...TENANT_RESOURCES,
  ...GLOBAL_RESOURCES,
] as const;
