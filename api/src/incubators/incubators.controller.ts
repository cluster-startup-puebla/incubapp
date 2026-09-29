import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { parseIfMatchVersion } from '../common/concurrency/if-match.js';
import { toList, toResource } from '../common/http/envelope.js';
import { ApiStandardErrors } from '../common/openapi/api-standard-errors.decorator.js';
import {
  parseOffsetPagination,
  withStableIdOrder,
} from '../common/query/pagination.js';
import { parseFilters } from '../common/query/filter.js';
import { parseSort } from '../common/query/sort.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  CreateIncubatorDto,
  INCUBATOR_FILTERS,
  INCUBATOR_SORT_FIELDS,
  ListIncubatorsQueryDto,
  UpdateIncubatorDto,
} from './incubator.dto.js';
import { IncubatorsService } from './incubators.service.js';

type AuditRequest = Request & { auditBefore?: unknown };

@ApiTags('incubators')
@ApiStandardErrors()
@AuditResource('incubator')
@UseInterceptors(AuditLogInterceptor)
@Controller('incubators')
@UseGuards(PermissionsGuard)
export class IncubatorsController {
  constructor(private readonly incubators: IncubatorsService) {}

  @Get()
  @ApiOperation({ summary: 'List active incubators' })
  @RequirePermissions('incubator:list')
  async list(@Query() query: ListIncubatorsQueryDto) {
    const pagination = parseOffsetPagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    const orderBy = withStableIdOrder(
      parseSort(query.sort, INCUBATOR_SORT_FIELDS),
    ) as Prisma.IncubatorOrderByWithRelationInput[];
    const where = parseFilters(
      query.filter,
      INCUBATOR_FILTERS,
    ) as Prisma.IncubatorWhereInput;

    const { items, total } = await this.incubators.list({
      skip: pagination.skip,
      take: pagination.take,
      orderBy,
      where,
      q: query.q,
    });

    return toList(items, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
    });
  }

  @Get('map')
  @ApiOperation({
    summary: 'GeoJSON FeatureCollection of incubators with coordinates',
  })
  @RequirePermissions('incubator:list')
  async map() {
    return this.incubators.mapFeatures();
  }

  @Get('trash')
  @ApiOperation({ summary: 'List soft-deleted incubators' })
  @RequirePermissions('incubator:restore')
  async listDeleted(@Query() query: ListIncubatorsQueryDto) {
    const pagination = parseOffsetPagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    const orderBy = withStableIdOrder(
      parseSort(query.sort, INCUBATOR_SORT_FIELDS),
    ) as Prisma.IncubatorOrderByWithRelationInput[];
    const where = parseFilters(
      query.filter,
      INCUBATOR_FILTERS,
    ) as Prisma.IncubatorWhereInput;

    const { items, total } = await this.incubators.listDeleted({
      skip: pagination.skip,
      take: pagination.take,
      orderBy,
      where,
    });

    return toList(items, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an incubator by id' })
  @RequirePermissions('incubator:read')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return toResource(await this.incubators.get(id));
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create an incubator' })
  @RequirePermissions('incubator:create')
  async create(
    @Body() body: CreateIncubatorDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const created = await this.incubators.create(body);
    res.setHeader('Location', `/api/v1/incubators/${created.id}`);
    return toResource(created);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an incubator (If-Match required)' })
  @RequirePermissions('incubator:update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateIncubatorDto,
    @Req() req: AuditRequest,
  ) {
    const version = parseIfMatchVersion(ifMatch);
    req.auditBefore = await this.incubators.get(id);
    return toResource(await this.incubators.update(id, version, body));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete an incubator' })
  @RequirePermissions('incubator:delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ): Promise<void> {
    req.auditBefore = await this.incubators.get(id);
    await this.incubators.remove(id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore a soft-deleted incubator' })
  @RequirePermissions('incubator:restore')
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ) {
    req.auditBefore = await this.incubators.getWithDeleted(id);
    return toResource(await this.incubators.restore(id));
  }

  @Delete(':id/purge')
  @HttpCode(204)
  @ApiOperation({ summary: 'Permanently delete a soft-deleted incubator' })
  @RequirePermissions('incubator:purge')
  async purge(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ): Promise<void> {
    req.auditBefore = await this.incubators.getWithDeleted(id);
    await this.incubators.purge(id);
  }
}
