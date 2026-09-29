import {
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.schema.js';
import {
  currentIncubatorId,
  currentIsSuperAdmin,
} from '../context/request-context.js';
import { withStableIdOrder } from '../common/query/pagination.js';
import type { Incubator, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AnalyticsOverview,
  GeoJsonFeatureCollection,
} from './analytics.dto.js';

const CACHE_TTL_SECONDS = 300;
const CACHE_GEN_KEY = 'analytics:overview:gen';
const CACHE_PREFIX = 'analytics:overview:';

type RedisOps = Pick<Redis, 'get' | 'setex' | 'incr' | 'disconnect'>;

export type OverviewQuery = {
  from?: string;
  to?: string;
  /** Membership roles from the request (PermissionsGuard already checked). */
  roles?: readonly string[];
};

const CLUSTER_WIDE_ROLES = new Set(['cluster_admin', 'coorganizer']);

@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  private readonly redisUrl: string;
  private redis: RedisOps | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() configService?: ConfigService<Env, true>,
  ) {
    this.redisUrl =
      configService?.get('REDIS_URL', { infer: true }) ??
      process.env.REDIS_URL ??
      '';
  }

  private getRedis(): RedisOps | null {
    if (!this.redisUrl) {
      return null;
    }
    if (!this.redis) {
      this.redis = new Redis(this.redisUrl, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });
    }
    return this.redis;
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
  }

  /**
   * Directors (and others with ALS incubatorId) may only see their scope.
   * Super admin / cluster_admin without header see the cluster aggregate.
   * Missing/foreign scope → 404 (not 403).
   */
  assertScopeAccess(incubatorId: string): void {
    if (currentIsSuperAdmin()) {
      return;
    }
    const scopeId = currentIncubatorId();
    if (scopeId !== null && scopeId !== incubatorId) {
      throw new NotFoundException('Analytics overview not found');
    }
  }

  /**
   * Cluster-wide roles (and super admin) may omit X-Incubator-Id.
   * Directors/staff still need resolved incubator scope → 404 if missing.
   */
  private resolveScope(roles: readonly string[]): string | null {
    if (currentIsSuperAdmin()) {
      return currentIncubatorId();
    }
    const scopeId = currentIncubatorId();
    const canAggregate = roles.some((role) => CLUSTER_WIDE_ROLES.has(role));
    if (canAggregate) {
      return scopeId;
    }
    if (scopeId === null) {
      throw new NotFoundException('Analytics overview not found');
    }
    return scopeId;
  }

  private dateWhere(
    from?: string,
    to?: string,
  ): Prisma.DateTimeFilter | undefined {
    if (from == null && to == null) {
      return undefined;
    }
    const filter: Prisma.DateTimeFilter = {};
    if (from != null) {
      filter.gte = new Date(`${from}T00:00:00.000Z`);
    }
    if (to != null) {
      filter.lte = new Date(`${to}T23:59:59.999Z`);
    }
    return filter;
  }

  private cacheKey(
    gen: string,
    scopeId: string | null,
    from?: string,
    to?: string,
  ): string {
    return `${CACHE_PREFIX}${gen}:${scopeId ?? 'all'}:${from ?? ''}:${to ?? ''}`;
  }

  private async readCache(key: string): Promise<AnalyticsOverview | null> {
    try {
      const redis = this.getRedis();
      if (!redis) {
        return null;
      }
      const raw = await redis.get(key);
      if (raw == null) {
        return null;
      }
      return JSON.parse(raw) as AnalyticsOverview;
    } catch {
      return null;
    }
  }

  private async writeCache(
    key: string,
    payload: AnalyticsOverview,
  ): Promise<void> {
    try {
      const redis = this.getRedis();
      if (!redis) {
        return;
      }
      await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(payload));
    } catch {
      // Fail open: still return counts.
    }
  }

  private async currentGen(): Promise<string> {
    try {
      const redis = this.getRedis();
      if (!redis) {
        return '0';
      }
      const value = await redis.get(CACHE_GEN_KEY);
      return value ?? '0';
    } catch {
      return '0';
    }
  }

  /** Bump generation so all overview keys miss on the next read. */
  async invalidateOverviewCache(): Promise<void> {
    try {
      const redis = this.getRedis();
      if (!redis) {
        return;
      }
      await redis.incr(CACHE_GEN_KEY);
    } catch {
      // Fail open on writes too.
    }
  }

  async overview(query: OverviewQuery = {}): Promise<AnalyticsOverview> {
    const roles = query.roles ?? [];
    const scopeId = this.resolveScope(roles);
    if (scopeId !== null) {
      this.assertScopeAccess(scopeId);
    }

    const gen = await this.currentGen();
    const key = this.cacheKey(gen, scopeId, query.from, query.to);
    const cached = await this.readCache(key);
    if (cached) {
      return cached;
    }

    const payload = await this.computeOverview(scopeId, query.from, query.to);
    await this.writeCache(key, payload);
    return payload;
  }

  /** Exposed for specs that assert count queries ran. */
  async computeOverview(
    scopeId: string | null,
    from?: string,
    to?: string,
  ): Promise<AnalyticsOverview> {
    const createdAt = this.dateWhere(from, to);
    const dateFilter = createdAt ? { createdAt } : {};

    const incubatorWhere: Prisma.IncubatorWhereInput = {
      ...dateFilter,
      ...(scopeId !== null ? { id: scopeId } : {}),
    };

    const startupWhere: Prisma.StartupWhereInput = {
      ...dateFilter,
      visibility: { not: 'PRIVATE' },
      ...(scopeId !== null ? { incubatorId: scopeId } : {}),
    };

    const incubationWhere: Prisma.IncubationWhereInput = {
      ...dateFilter,
      ...(scopeId !== null ? { incubatorId: scopeId } : {}),
    };

    const stageWhere: Prisma.FrameworkStageWhereInput = {
      ...dateFilter,
      ...(scopeId !== null
        ? { framework: { incubators: { some: { id: scopeId } } } }
        : {}),
    };

    const [incubators, stages, startups, funnelRows] = await Promise.all([
      this.prisma.client.incubator.count({ where: incubatorWhere }),
      this.prisma.client.frameworkStage.count({ where: stageWhere }),
      this.prisma.client.startup.count({ where: startupWhere }),
      this.prisma.client.incubation.groupBy({
        by: ['status'],
        where: incubationWhere,
        _count: { _all: true },
      }),
    ]);

    const funnel = {
      applied: 0,
      active: 0,
      graduated: 0,
      dropped: 0,
    };
    for (const row of funnelRows) {
      if (row.status === 'applied') {
        funnel.applied = row._count._all;
      } else if (row.status === 'active') {
        funnel.active = row._count._all;
      } else if (row.status === 'graduated') {
        funnel.graduated = row._count._all;
      } else if (row.status === 'dropped') {
        funnel.dropped = row._count._all;
      }
    }

    return { incubators, stages, startups, funnel };
  }

  /**
   * GeoJSON FeatureCollection of incubators with both coordinates.
   * Soft-deleted rows are omitted by the Prisma extension.
   * Cluster-wide roles without X-Incubator-Id see the full cluster map.
   */
  async mapFeatures(
    query: Pick<OverviewQuery, 'roles'> = {},
  ): Promise<GeoJsonFeatureCollection> {
    const roles = query.roles ?? [];
    const scopeId = this.resolveScope(roles);
    if (scopeId !== null) {
      this.assertScopeAccess(scopeId);
    }

    const where: Prisma.IncubatorWhereInput = {
      latitude: { not: null },
      longitude: { not: null },
      ...(scopeId !== null ? { id: scopeId } : {}),
    };

    const rows = await this.prisma.client.incubator.findMany({
      where,
      orderBy: withStableIdOrder([{ createdAt: 'desc' }]),
    });

    return {
      type: 'FeatureCollection',
      features: rows
        .filter(
          (row): row is Incubator & { latitude: number; longitude: number } =>
            row.latitude != null && row.longitude != null,
        )
        .map((row) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [row.longitude, row.latitude] as [number, number],
          },
          properties: {
            id: row.id,
            name: row.name,
            slug: row.slug,
          },
        })),
    };
  }
}
