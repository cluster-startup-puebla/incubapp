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
  CreateGeoUnitDto,
  GEO_UNIT_FILTERS,
  GEO_UNIT_SORT_FIELDS,
  ListGeoUnitsQueryDto,
  UpdateGeoUnitDto,
} from './geo-unit.dto.js';
import { GeoUnitsService } from './geo-units.service.js';

type AuditRequest = Request & { auditBefore?: unknown };

@ApiTags('geo-units')
@ApiStandardErrors()
@AuditResource('geo-unit')
@UseInterceptors(AuditLogInterceptor)
@Controller('geo-units')
@UseGuards(PermissionsGuard)
export class GeoUnitsController {
  constructor(private readonly geoUnits: GeoUnitsService) {}

  @Get()
  @ApiOperation({ summary: 'List active geo units' })
  @RequirePermissions('geo-unit:list')
  async list(@Query() query: ListGeoUnitsQueryDto) {
    const pagination = parseOffsetPagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    const orderBy = withStableIdOrder(
      parseSort(query.sort, GEO_UNIT_SORT_FIELDS),
    ) as Prisma.GeoUnitOrderByWithRelationInput[];
    const where = parseFilters(
      query.filter,
      GEO_UNIT_FILTERS,
    ) as Prisma.GeoUnitWhereInput;

    const { items, total } = await this.geoUnits.list({
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

  @Get('trash')
  @ApiOperation({ summary: 'List soft-deleted geo units' })
  @RequirePermissions('geo-unit:restore')
  async listDeleted(@Query() query: ListGeoUnitsQueryDto) {
    const pagination = parseOffsetPagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    const orderBy = withStableIdOrder(
      parseSort(query.sort, GEO_UNIT_SORT_FIELDS),
    ) as Prisma.GeoUnitOrderByWithRelationInput[];
    const where = parseFilters(
      query.filter,
      GEO_UNIT_FILTERS,
    ) as Prisma.GeoUnitWhereInput;

    const { items, total } = await this.geoUnits.listDeleted({
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

  @Get(':id/children')
  @ApiOperation({ summary: 'List children of a geo unit' })
  @RequirePermissions('geo-unit:read')
  async listChildren(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListGeoUnitsQueryDto,
  ) {
    const pagination = parseOffsetPagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    const orderBy = withStableIdOrder(
      parseSort(query.sort, GEO_UNIT_SORT_FIELDS),
    ) as Prisma.GeoUnitOrderByWithRelationInput[];

    const { items, total } = await this.geoUnits.listChildren(id, {
      skip: pagination.skip,
      take: pagination.take,
      orderBy,
    });

    return toList(items, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a geo unit by id' })
  @RequirePermissions('geo-unit:read')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return toResource(await this.geoUnits.get(id));
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a geo unit' })
  @RequirePermissions('geo-unit:create')
  async create(
    @Body() body: CreateGeoUnitDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const created = await this.geoUnits.create(body);
    res.setHeader('Location', `/api/v1/geo-units/${created.id}`);
    return toResource(created);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a geo unit (If-Match required)' })
  @RequirePermissions('geo-unit:update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateGeoUnitDto,
    @Req() req: AuditRequest,
  ) {
    const version = parseIfMatchVersion(ifMatch);
    req.auditBefore = await this.geoUnits.get(id);
    return toResource(await this.geoUnits.update(id, version, body));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a geo unit' })
  @RequirePermissions('geo-unit:delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ): Promise<void> {
    req.auditBefore = await this.geoUnits.get(id);
    await this.geoUnits.remove(id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore a soft-deleted geo unit' })
  @RequirePermissions('geo-unit:restore')
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ) {
    req.auditBefore = await this.geoUnits.getWithDeleted(id);
    return toResource(await this.geoUnits.restore(id));
  }

  @Delete(':id/purge')
  @HttpCode(204)
  @ApiOperation({ summary: 'Permanently delete a soft-deleted geo unit' })
  @RequirePermissions('geo-unit:purge')
  async purge(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ): Promise<void> {
    req.auditBefore = await this.geoUnits.getWithDeleted(id);
    await this.geoUnits.purge(id);
  }
}
