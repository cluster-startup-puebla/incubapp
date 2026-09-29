import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermissions } from '../authz/require-permissions.decorator.js';
import { toResource } from '../common/http/envelope.js';
import { ApiStandardErrors } from '../common/openapi/api-standard-errors.decorator.js';
import { OverviewQueryDto } from './analytics.dto.js';
import { AnalyticsService } from './analytics.service.js';

type RequestWithRoles = Request & {
  membershipRoles?: string[];
};

@ApiTags('analytics')
@ApiStandardErrors()
@Controller('analytics')
@UseGuards(PermissionsGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Cluster analytics overview counts and funnel' })
  @RequirePermissions('analytics:read')
  async overview(
    @Query() query: OverviewQueryDto,
    @Req() req: RequestWithRoles,
  ) {
    return toResource(
      await this.analytics.overview({
        from: query.from,
        to: query.to,
        roles: req.membershipRoles ?? [],
      }),
    );
  }

  @Get('map')
  @ApiOperation({
    summary:
      'GeoJSON FeatureCollection of incubators with coordinates (raw body, not {data})',
  })
  @ApiOkResponse({
    description:
      'Raw GeoJSON FeatureCollection (type + features). Not wrapped in { data }. Soft-deleted and null-coordinate incubators are omitted.',
    schema: {
      type: 'object',
      required: ['type', 'features'],
      properties: {
        type: { type: 'string', enum: ['FeatureCollection'] },
        features: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['Feature'] },
              geometry: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['Point'] },
                  coordinates: {
                    type: 'array',
                    items: { type: 'number' },
                    minItems: 2,
                    maxItems: 2,
                    description: '[longitude, latitude]',
                  },
                },
              },
              properties: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  slug: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  })
  @RequirePermissions('analytics:read')
  async map(@Req() req: RequestWithRoles) {
    return this.analytics.mapFeatures({
      roles: req.membershipRoles ?? [],
    });
  }
}
