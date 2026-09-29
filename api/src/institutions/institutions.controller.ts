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
  CreateInstitutionDto,
  INSTITUTION_FILTERS,
  INSTITUTION_SORT_FIELDS,
  ListInstitutionsQueryDto,
  UpdateInstitutionDto,
} from './institution.dto.js';
import { InstitutionsService } from './institutions.service.js';

type AuditRequest = Request & { auditBefore?: unknown };

@ApiTags('institutions')
@ApiStandardErrors()
@AuditResource('institution')
@UseInterceptors(AuditLogInterceptor)
@Controller('institutions')
@UseGuards(PermissionsGuard)
export class InstitutionsController {
  constructor(private readonly institutions: InstitutionsService) {}

  @Get()
  @ApiOperation({ summary: 'List active institutions' })
  @RequirePermissions('institution:list')
  async list(@Query() query: ListInstitutionsQueryDto) {
    const pagination = parseOffsetPagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    const orderBy = withStableIdOrder(
      parseSort(query.sort, INSTITUTION_SORT_FIELDS),
    ) as Prisma.InstitutionOrderByWithRelationInput[];
    const where = parseFilters(
      query.filter,
      INSTITUTION_FILTERS,
    ) as Prisma.InstitutionWhereInput;

    const { items, total } = await this.institutions.list({
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
  @ApiOperation({ summary: 'List soft-deleted institutions' })
  @RequirePermissions('institution:restore')
  async listDeleted(@Query() query: ListInstitutionsQueryDto) {
    const pagination = parseOffsetPagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    const orderBy = withStableIdOrder(
      parseSort(query.sort, INSTITUTION_SORT_FIELDS),
    ) as Prisma.InstitutionOrderByWithRelationInput[];
    const where = parseFilters(
      query.filter,
      INSTITUTION_FILTERS,
    ) as Prisma.InstitutionWhereInput;

    const { items, total } = await this.institutions.listDeleted({
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
  @ApiOperation({ summary: 'Get an institution by id' })
  @RequirePermissions('institution:read')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return toResource(await this.institutions.get(id));
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create an institution' })
  @RequirePermissions('institution:create')
  async create(
    @Body() body: CreateInstitutionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const created = await this.institutions.create(body);
    res.setHeader('Location', `/api/v1/institutions/${created.id}`);
    return toResource(created);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an institution (If-Match required)' })
  @RequirePermissions('institution:update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateInstitutionDto,
    @Req() req: AuditRequest,
  ) {
    const version = parseIfMatchVersion(ifMatch);
    req.auditBefore = await this.institutions.get(id);
    return toResource(await this.institutions.update(id, version, body));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete an institution' })
  @RequirePermissions('institution:delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ): Promise<void> {
    req.auditBefore = await this.institutions.get(id);
    await this.institutions.remove(id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore a soft-deleted institution' })
  @RequirePermissions('institution:restore')
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ) {
    req.auditBefore = await this.institutions.getWithDeleted(id);
    return toResource(await this.institutions.restore(id));
  }

  @Delete(':id/purge')
  @HttpCode(204)
  @ApiOperation({ summary: 'Permanently delete a soft-deleted institution' })
  @RequirePermissions('institution:purge')
  async purge(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ): Promise<void> {
    req.auditBefore = await this.institutions.getWithDeleted(id);
    await this.institutions.purge(id);
  }
}
