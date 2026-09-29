import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Body,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { toList } from '../common/http/envelope.js';
import { ApiStandardErrors } from '../common/openapi/api-standard-errors.decorator.js';
import { ChangePasswordDto } from './change-password.dto.js';
import { SessionsService } from './sessions.service.js';

function toHeaders(req: Request): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

@ApiTags('sessions')
@ApiStandardErrors()
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  @ApiOperation({ summary: 'List sessions for the current user' })
  async list(@Req() req: Request) {
    const sessions = await this.sessionsService.list(toHeaders(req));
    const safe = sessions.map((session) => {
      const { token: omitted, ...rest } = session;
      void omitted;
      return rest;
    });
    return toList(safe, {
      page: 1,
      pageSize: safe.length,
      total: safe.length,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke a session by id' })
  async revoke(@Param('id') id: string, @Req() req: Request): Promise<void> {
    await this.sessionsService.revoke(id, toHeaders(req));
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke all other sessions' })
  async revokeAll(@Req() req: Request): Promise<void> {
    await this.sessionsService.revokeAll(toHeaders(req));
  }

  @Post('change-password')
  @HttpCode(204)
  @ApiOperation({ summary: 'Change password and revoke other sessions' })
  async changePassword(
    @Req() req: Request,
    @Body() body: ChangePasswordDto,
  ): Promise<void> {
    await this.sessionsService.changePassword({
      headers: toHeaders(req),
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });
  }
}
