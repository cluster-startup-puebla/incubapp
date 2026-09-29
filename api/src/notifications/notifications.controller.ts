import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
  ListNotificationsQueryDto,
  NOTIFICATION_FILTERS,
  NOTIFICATION_SORT_FIELDS,
} from './notification.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@ApiStandardErrors()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the current user' })
  async list(@Query() query: ListNotificationsQueryDto) {
    const pagination = parseOffsetPagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    const orderBy = withStableIdOrder(
      parseSort(query.sort, NOTIFICATION_SORT_FIELDS),
    ) as Prisma.NotificationOrderByWithRelationInput[];
    const where = parseFilters(
      query.filter,
      NOTIFICATION_FILTERS,
    ) as Prisma.NotificationWhereInput;

    const { items, total } = await this.notifications.list({
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
  @ApiOperation({ summary: 'Get a notification by id (own only)' })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return toResource(await this.notifications.get(id));
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a notification as read (own only)' })
  async markRead(@Param('id', ParseUUIDPipe) id: string) {
    return toResource(await this.notifications.markRead(id));
  }
}
