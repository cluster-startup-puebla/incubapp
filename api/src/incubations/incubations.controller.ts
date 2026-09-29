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
import { RequiresTenant } from '../tenant/requires-tenant.decorator.js';
import {
  CreateIncubationDto,
  INCUBATION_FILTERS,
  INCUBATION_SORT_FIELDS,
  ListIncubationsQueryDto,
  UpdateIncubationDto,
} from './incubation.dto.js';
import { IncubationsService } from './incubations.service.js';

type AuditRequest = Request & { auditBefore?: unknown };

@ApiTags('incubations')
@ApiStandardErrors()
@AuditResource('incubation')
@UseInterceptors(AuditLogInterceptor)
@Controller('incubations')
@RequiresTenant()
@UseGuards(PermissionsGuard)
export class IncubationsController {
  constructor(private readonly incubations: IncubationsService) {}

  @Get()
  @ApiOperation({ summary: 'List incubations in the active incubator' })
  @RequirePermissions('incubation:list')
  async list(@Query() query: ListIncubationsQueryDto) {
    const pagination = parseOffsetPagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    const orderBy = withStableIdOrder(
      parseSort(query.sort, INCUBATION_SORT_FIELDS),
    ) as Prisma.IncubationOrderByWithRelationInput[];
    const where = parseFilters(
      query.filter,
      INCUBATION_FILTERS,
    ) as Prisma.IncubationWhereInput;

    const { items, total } = await this.incubations.list({
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
  @ApiOperation({ summary: 'List soft-deleted incubations' })
  @RequirePermissions('incubation:restore')
  async listDeleted(@Query() query: ListIncubationsQueryDto) {
    const pagination = parseOffsetPagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    const orderBy = withStableIdOrder(
      parseSort(query.sort, INCUBATION_SORT_FIELDS),
    ) as Prisma.IncubationOrderByWithRelationInput[];
    const where = parseFilters(
      query.filter,
      INCUBATION_FILTERS,
    ) as Prisma.IncubationWhereInput;

    const { items, total } = await this.incubations.listDeleted({
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
  @ApiOperation({ summary: 'Get an incubation by id' })
  @RequirePermissions('incubation:read')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return toResource(await this.incubations.get(id));
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create an incubation (default status applied)' })
  @RequirePermissions('incubation:create')
  async create(
    @Body() body: CreateIncubationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const created = await this.incubations.create(body);
    res.setHeader('Location', `/api/v1/incubations/${created.id}`);
    return toResource(created);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an incubation (If-Match required)' })
  @RequirePermissions('incubation:update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateIncubationDto,
    @Req() req: AuditRequest,
  ) {
    const version = parseIfMatchVersion(ifMatch);
    req.auditBefore = await this.incubations.get(id);
    return toResource(await this.incubations.update(id, version, body));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete an incubation' })
  @RequirePermissions('incubation:delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ): Promise<void> {
    req.auditBefore = await this.incubations.get(id);
    await this.incubations.remove(id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore a soft-deleted incubation' })
  @RequirePermissions('incubation:restore')
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ) {
    req.auditBefore = await this.incubations.getWithDeleted(id);
    return toResource(await this.incubations.restore(id));
  }

  @Delete(':id/purge')
  @HttpCode(204)
  @ApiOperation({ summary: 'Permanently delete a soft-deleted incubation' })
  @RequirePermissions('incubation:purge')
  async purge(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ): Promise<void> {
    req.auditBefore = await this.incubations.getWithDeleted(id);
    await this.incubations.purge(id);
  }
}
