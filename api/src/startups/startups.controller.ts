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
  CreateStartupDto,
  CreateStartupQueryDto,
  ListStartupsQueryDto,
  STARTUP_FILTERS,
  STARTUP_SORT_FIELDS,
  UpdateStartupDto,
} from './startup.dto.js';
import { StartupsService } from './startups.service.js';

type AuditRequest = Request & {
  auditBefore?: unknown;
  user?: { id?: string; isSuperAdmin?: boolean } | null;
  membershipRoles?: string[];
};

@ApiTags('startups')
@ApiStandardErrors()
@AuditResource('startup')
@UseInterceptors(AuditLogInterceptor)
@Controller('startups')
@RequiresTenant()
@UseGuards(PermissionsGuard)
export class StartupsController {
  constructor(private readonly startups: StartupsService) {}

  @Get()
  @ApiOperation({ summary: 'List startups in the active incubator' })
  @RequirePermissions('startup:list')
  async list(@Query() query: ListStartupsQueryDto) {
    const pagination = parseOffsetPagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    const orderBy = withStableIdOrder(
      parseSort(query.sort, STARTUP_SORT_FIELDS),
    ) as Prisma.StartupOrderByWithRelationInput[];
    const where = parseFilters(
      query.filter,
      STARTUP_FILTERS,
    ) as Prisma.StartupWhereInput;

    const { items, total } = await this.startups.list({
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
  @ApiOperation({ summary: 'List soft-deleted startups' })
  @RequirePermissions('startup:restore')
  async listDeleted(@Query() query: ListStartupsQueryDto) {
    const pagination = parseOffsetPagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    const orderBy = withStableIdOrder(
      parseSort(query.sort, STARTUP_SORT_FIELDS),
    ) as Prisma.StartupOrderByWithRelationInput[];
    const where = parseFilters(
      query.filter,
      STARTUP_FILTERS,
    ) as Prisma.StartupWhereInput;

    const { items, total } = await this.startups.listDeleted({
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
  @ApiOperation({ summary: 'Get a startup by id' })
  @RequirePermissions('startup:read')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return toResource(await this.startups.get(id));
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a startup' })
  @RequirePermissions('startup:create')
  async create(
    @Body() body: CreateStartupDto,
    @Query() query: CreateStartupQueryDto,
    @Req() req: AuditRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const created = await this.startups.create(body, {
      force: query.force === true,
      isSuperAdmin: Boolean(req.user?.isSuperAdmin),
    });
    res.setHeader('Location', `/api/v1/startups/${created.id}`);
    return toResource(created);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a startup (If-Match required)' })
  @RequirePermissions('startup:update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateStartupDto,
    @Req() req: AuditRequest,
  ) {
    const version = parseIfMatchVersion(ifMatch);
    req.auditBefore = await this.startups.get(id);
    return toResource(
      await this.startups.update(id, version, body, {
        roles: req.membershipRoles ?? [],
        isSuperAdmin: Boolean(req.user?.isSuperAdmin),
      }),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a startup' })
  @RequirePermissions('startup:delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ): Promise<void> {
    req.auditBefore = await this.startups.get(id);
    await this.startups.remove(id, {
      roles: req.membershipRoles ?? [],
      isSuperAdmin: Boolean(req.user?.isSuperAdmin),
    });
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore a soft-deleted startup' })
  @RequirePermissions('startup:restore')
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ) {
    req.auditBefore = await this.startups.getWithDeleted(id);
    return toResource(
      await this.startups.restore(id, {
        roles: req.membershipRoles ?? [],
        isSuperAdmin: Boolean(req.user?.isSuperAdmin),
      }),
    );
  }

  @Delete(':id/purge')
  @HttpCode(204)
  @ApiOperation({ summary: 'Permanently delete a soft-deleted startup' })
  @RequirePermissions('startup:purge')
  async purge(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ): Promise<void> {
    req.auditBefore = await this.startups.getWithDeleted(id);
    await this.startups.purge(id);
  }
}
