/**
 * Registry of tenant-scoped HTTP resources for the anti-IDOR suite.
 * Every model in TENANT_MODELS must appear here.
 */
export const TENANT_RESOURCES = [
  {
    model: 'Startup' as const,
    basePath: '/api/v1/startups',
    methods: ['GET', 'PATCH', 'DELETE'] as const,
  },
] as const;

export type TenantResource = (typeof TENANT_RESOURCES)[number];
