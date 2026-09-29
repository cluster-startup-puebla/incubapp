import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
}
