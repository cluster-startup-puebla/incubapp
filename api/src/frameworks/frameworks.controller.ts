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
import { canPerform } from '../authz/permissions.js';
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
  CreateFrameworkDto,
  CreateFrameworkStageDto,
  FRAMEWORK_FILTERS,
  FRAMEWORK_SORT_FIELDS,
  ListFrameworksQueryDto,
  UpdateFrameworkDto,
} from './framework.dto.js';
import { FrameworksService } from './frameworks.service.js';

type AuditRequest = Request & {
  auditBefore?: unknown;
  user?: { id?: string; isSuperAdmin?: boolean } | null;
  membershipRoles?: string[];
};

@ApiTags('frameworks')
@ApiStandardErrors()
@AuditResource('framework')
@UseInterceptors(AuditLogInterceptor)
@Controller('frameworks')
@UseGuards(PermissionsGuard)
export class FrameworksController {
  constructor(private readonly frameworks: FrameworksService) {}

  private includeDrafts(req: AuditRequest): boolean {
    return canPerform({
      roles: req.membershipRoles ?? [],
      permission: 'framework:create',
      isSuperAdmin: Boolean(req.user?.isSuperAdmin),
    });
  }

  @Get()
  @ApiOperation({ summary: 'List active frameworks' })
  @RequirePermissions('framework:list')
  async list(@Query() query: ListFrameworksQueryDto, @Req() req: AuditRequest) {
    const pagination = parseOffsetPagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    const orderBy = withStableIdOrder(
      parseSort(query.sort, FRAMEWORK_SORT_FIELDS),
    ) as Prisma.FrameworkOrderByWithRelationInput[];
    const where = parseFilters(
      query.filter,
      FRAMEWORK_FILTERS,
    ) as Prisma.FrameworkWhereInput;

    const { items, total } = await this.frameworks.list({
      skip: pagination.skip,
      take: pagination.take,
      orderBy,
      where,
      q: query.q,
      includeDrafts: this.includeDrafts(req),
    });

    return toList(items, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
    });
  }

  @Get('trash')
  @ApiOperation({ summary: 'List soft-deleted frameworks' })
  @RequirePermissions('framework:restore')
  async listDeleted(@Query() query: ListFrameworksQueryDto) {
    const pagination = parseOffsetPagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    const orderBy = withStableIdOrder(
      parseSort(query.sort, FRAMEWORK_SORT_FIELDS),
    ) as Prisma.FrameworkOrderByWithRelationInput[];
    const where = parseFilters(
      query.filter,
      FRAMEWORK_FILTERS,
    ) as Prisma.FrameworkWhereInput;

    const { items, total } = await this.frameworks.listDeleted({
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
  @ApiOperation({ summary: 'Get a framework by id' })
  @RequirePermissions('framework:read')
  async get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuditRequest) {
    return toResource(
      await this.frameworks.get(id, {
        includeDrafts: this.includeDrafts(req),
      }),
    );
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a draft framework' })
  @RequirePermissions('framework:create')
  async create(
    @Body() body: CreateFrameworkDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const created = await this.frameworks.create(body);
    res.setHeader('Location', `/api/v1/frameworks/${created.id}`);
    return toResource(created);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a draft framework (If-Match required)' })
  @RequirePermissions('framework:update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateFrameworkDto,
    @Req() req: AuditRequest,
  ) {
    const version = parseIfMatchVersion(ifMatch);
    req.auditBefore = await this.frameworks.get(id, { includeDrafts: true });
    return toResource(await this.frameworks.update(id, version, body));
  }

  @Post(':id/stages')
  @HttpCode(201)
  @ApiOperation({ summary: 'Add a stage to a draft framework' })
  @RequirePermissions('framework:update')
  async addStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateFrameworkStageDto,
    @Req() req: AuditRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    req.auditBefore = await this.frameworks.get(id, { includeDrafts: true });
    const created = await this.frameworks.addStage(id, body);
    res.setHeader('Location', `/api/v1/frameworks/${id}/stages/${created.id}`);
    return toResource(created);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publish a draft framework (cluster_admin)' })
  @RequirePermissions('framework:update')
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ) {
    req.auditBefore = await this.frameworks.get(id, { includeDrafts: true });
    return toResource(
      await this.frameworks.publish(id, req.membershipRoles ?? []),
    );
  }

  @Post(':id/clone')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Clone a framework to the next major version as DRAFT',
  })
  @RequirePermissions('framework:create')
  async clone(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    req.auditBefore = await this.frameworks.get(id, {
      includeDrafts: this.includeDrafts(req),
    });
    const created = await this.frameworks.clone(id, req.membershipRoles ?? []);
    res.setHeader('Location', `/api/v1/frameworks/${created.id}`);
    return toResource(created);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a framework' })
  @RequirePermissions('framework:delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ): Promise<void> {
    req.auditBefore = await this.frameworks.get(id, { includeDrafts: true });
    await this.frameworks.remove(id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore a soft-deleted framework' })
  @RequirePermissions('framework:restore')
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ) {
    req.auditBefore = await this.frameworks.getWithDeleted(id);
    return toResource(await this.frameworks.restore(id));
  }

  @Delete(':id/purge')
  @HttpCode(204)
  @ApiOperation({ summary: 'Permanently delete a soft-deleted framework' })
  @RequirePermissions('framework:purge')
  async purge(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ): Promise<void> {
    req.auditBefore = await this.frameworks.getWithDeleted(id);
    await this.frameworks.purge(id);
  }
}
