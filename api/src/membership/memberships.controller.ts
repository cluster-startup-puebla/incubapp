import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import { toList, toResource } from '../common/http/envelope.js';
import { ApiStandardErrors } from '../common/openapi/api-standard-errors.decorator.js';
import {
  parseOffsetPagination,
  withStableIdOrder,
} from '../common/query/pagination.js';
import { parseFilters } from '../common/query/filter.js';
import { parseSort } from '../common/query/sort.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { RequestWithTenant } from '../tenant/tenant-context.js';
import {
  AcceptInvitationDto,
  InviteMembershipDto,
  ListMembershipsQueryDto,
  MEMBERSHIP_FILTERS,
  MEMBERSHIP_SORT_FIELDS,
} from './membership.dto.js';
import { MembershipsHttpService } from './memberships-http.service.js';

type AuditRequest = Request & { auditBefore?: unknown };

@ApiTags('memberships')
@ApiStandardErrors()
@AuditResource('membership')
@UseInterceptors(AuditLogInterceptor)
@Controller('memberships')
@UseGuards(PermissionsGuard)
export class MembershipsController {
  constructor(private readonly memberships: MembershipsHttpService) {}

  @Get()
  @ApiOperation({ summary: 'List active memberships' })
  @RequirePermissions('membership:list')
  async list(@Query() query: ListMembershipsQueryDto) {
    const pagination = parseOffsetPagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    const orderBy = withStableIdOrder(
      parseSort(query.sort, MEMBERSHIP_SORT_FIELDS),
    ) as Prisma.MembershipOrderByWithRelationInput[];
    const where = parseFilters(
      query.filter,
      MEMBERSHIP_FILTERS,
    ) as Prisma.MembershipWhereInput;

    const { items, total } = await this.memberships.list({
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
  @ApiOperation({ summary: 'Get a membership by id' })
  @RequirePermissions('membership:read')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return toResource(await this.memberships.get(id));
  }

  @Post('invite')
  @HttpCode(201)
  @ApiOperation({ summary: 'Invite a user and create a membership' })
  @RequirePermissions('membership:create')
  async invite(
    @Body() body: InviteMembershipDto,
    @Req() req: RequestWithTenant,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.memberships.invite({
      email: body.email,
      role: body.role,
      scopeType: body.scopeType,
      scopeId: body.scopeId,
      name: body.name,
      expiresInDays: body.expiresInDays,
      actorRoles: req.membershipRoles ?? [],
    });
    res.setHeader('Location', `/api/v1/memberships/${result.membership.id}`);
    return toResource(result);
  }

  @Post('invitations/:id/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept a membership invitation by token' })
  async accept(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AcceptInvitationDto,
  ) {
    // AuthGate only: invitees may lack membership:read until after accept.
    return toResource(await this.memberships.acceptInvitation(id, body.token));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a membership' })
  @RequirePermissions('membership:delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuditRequest,
  ): Promise<void> {
    req.auditBefore = await this.memberships.get(id);
    await this.memberships.remove(id);
  }
}
