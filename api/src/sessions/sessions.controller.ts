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
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
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
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  async list(@Req() req: Request) {
    const sessions = await this.sessionsService.list(toHeaders(req));
    return sessions.map((session) => {
      const { token: omitted, ...rest } = session;
      void omitted;
      return rest;
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(@Param('id') id: string, @Req() req: Request): Promise<void> {
    await this.sessionsService.revoke(id, toHeaders(req));
  }

  @Delete()
  @HttpCode(204)
  async revokeAll(@Req() req: Request): Promise<void> {
    await this.sessionsService.revokeAll(toHeaders(req));
  }

  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @Req() req: Request,
    @Body()
    body: {
      currentPassword: string;
      newPassword: string;
    },
  ): Promise<void> {
    await this.sessionsService.changePassword({
      headers: toHeaders(req),
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });
  }
}
