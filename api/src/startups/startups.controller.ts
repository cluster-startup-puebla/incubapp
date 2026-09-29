import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermissions } from '../authz/require-permissions.decorator.js';
import { toList, toResource } from '../common/http/envelope.js';
import { ApiStandardErrors } from '../common/openapi/api-standard-errors.decorator.js';
import {
  parseOffsetPagination,
  withStableIdOrder,
} from '../common/query/pagination.js';
import { parseFilters, STARTUP_FILTERS } from '../common/query/filter.js';
import { parseSort, STARTUP_SORT_FIELDS } from '../common/query/sort.js';
import { RequiresTenant } from '../tenant/requires-tenant.decorator.js';
import {
  CreateStartupDto,
  ListStartupsQueryDto,
  UpdateStartupDto,
} from './startup.dto.js';
import { StartupsService } from './startups.service.js';
import type { Prisma } from '../generated/prisma/client.js';

@ApiTags('startups')
@ApiStandardErrors()
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
  async get(@Param('id') id: string) {
    return toResource(await this.startups.get(id));
  }

  @Post()
  @ApiOperation({ summary: 'Create a startup' })
  @RequirePermissions('startup:create')
  async create(@Body() body: CreateStartupDto) {
    return toResource(await this.startups.create(body));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a startup' })
  @RequirePermissions('startup:update')
  async update(@Param('id') id: string, @Body() body: UpdateStartupDto) {
    return toResource(await this.startups.update(id, body));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a startup' })
  @RequirePermissions('startup:delete')
  async remove(@Param('id') id: string): Promise<void> {
    await this.startups.remove(id);
  }
}
