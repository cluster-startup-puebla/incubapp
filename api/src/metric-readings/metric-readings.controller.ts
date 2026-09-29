import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuditResource } from '../audit/audit-log.interceptor.js';
import { AuditLogInterceptor } from '../audit/audit-log.interceptor.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermissions } from '../authz/require-permissions.decorator.js';
import { toList, toResource } from '../common/http/envelope.js';
import { ApiStandardErrors } from '../common/openapi/api-standard-errors.decorator.js';
import {
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  toCursorPage,
} from '../common/query/pagination.js';
import { parseFilters } from '../common/query/filter.js';
import type { Prisma } from '../generated/prisma/client.js';
import { IdempotencyGuard } from '../idempotency/idempotency.guard.js';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor.js';
import { RequireIdempotency } from '../idempotency/idempotency.decorator.js';
import { RequiresTenant } from '../tenant/requires-tenant.decorator.js';
import {
  ListMetricReadingsQueryDto,
  METRIC_READING_FILTERS,
  UpsertMetricReadingDto,
} from './metric-reading.dto.js';
import { MetricReadingsService } from './metric-readings.service.js';

type AuditRequest = Request & {
  auditBefore?: unknown;
  user?: { id?: string; isSuperAdmin?: boolean } | null;
  membershipRoles?: string[];
};

@ApiTags('metric-readings')
@ApiStandardErrors()
@AuditResource('metric-reading')
@UseInterceptors(AuditLogInterceptor)
@Controller('startups/:startupId/metrics')
@RequiresTenant()
@UseGuards(PermissionsGuard)
export class MetricReadingsController {
  constructor(private readonly readings: MetricReadingsService) {}

  @Get()
  @ApiOperation({
    summary: 'List metric readings for a startup (cursor, no total)',
  })
  @RequirePermissions('startup:read')
  async list(
    @Param('startupId', ParseUUIDPipe) startupId: string,
    @Query() query: ListMetricReadingsQueryDto,
  ) {
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    if (query.cursor) {
      decodeCursor(query.cursor);
    }
    const where = parseFilters(
      query.filter,
      METRIC_READING_FILTERS,
    ) as Prisma.MetricReadingWhereInput;

    const { items } = await this.readings.list({
      startupId,
      take: pageSize,
      cursor: query.cursor,
      where,
    });

    const page = toCursorPage({ items, pageSize });
    return toList(page.data, {
      pageSize: page.meta.pageSize,
      nextCursor: page.meta.nextCursor,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a metric reading by id' })
  @RequirePermissions('startup:read')
  async get(
    @Param('startupId', ParseUUIDPipe) startupId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return toResource(await this.readings.get(startupId, id));
  }

  @Put()
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: 'Upsert a metric reading (Idempotency-Key required)',
  })
  @RequirePermissions('startup:update')
  async upsert(
    @Param('startupId', ParseUUIDPipe) startupId: string,
    @Body() body: UpsertMetricReadingDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { row, created } = await this.readings.upsert(startupId, body);
    res.status(created ? 201 : 200);
    res.setHeader(
      'Location',
      `/api/v1/startups/${startupId}/metrics/${row.id}`,
    );
    return toResource(row);
  }

  @Post(':id/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify a metric reading (staff/director only)' })
  @RequirePermissions('startup:update')
  async verify(
    @Param('startupId', ParseUUIDPipe) startupId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ) {
    req.auditBefore = await this.readings.get(startupId, id);
    return toResource(
      await this.readings.verify(startupId, id, {
        roles: req.membershipRoles ?? [],
        isSuperAdmin: Boolean(req.user?.isSuperAdmin),
      }),
    );
  }
}
