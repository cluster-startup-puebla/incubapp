import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermissions } from '../authz/require-permissions.decorator.js';
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
  ListUsersQueryDto,
  USER_FILTERS,
  USER_SORT_FIELDS,
} from '../membership/membership.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiStandardErrors()
@Controller('users')
@UseGuards(PermissionsGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users' })
  @RequirePermissions('user:list')
  async list(@Query() query: ListUsersQueryDto) {
    const pagination = parseOffsetPagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    const orderBy = withStableIdOrder(
      parseSort(query.sort, USER_SORT_FIELDS),
    ) as Prisma.UserOrderByWithRelationInput[];
    const where = parseFilters(
      query.filter,
      USER_FILTERS,
    ) as Prisma.UserWhereInput;

    const { items, total } = await this.users.list({
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

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  @RequirePermissions('user:read')
  async get(@Param('id') id: string) {
    return toResource(await this.users.get(id));
  }
}
