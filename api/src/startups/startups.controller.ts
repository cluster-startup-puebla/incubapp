import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { RequirePermissions } from '../authz/require-permissions.decorator.js';
import { RequiresTenant } from '../tenant/requires-tenant.decorator.js';
import { StartupsService } from './startups.service.js';

@ApiTags('startups')
@Controller('startups')
@RequiresTenant()
@UseGuards(PermissionsGuard)
export class StartupsController {
  constructor(private readonly startups: StartupsService) {}

  @Get()
  @RequirePermissions('startup:list')
  list() {
    return this.startups.list();
  }

  @Get(':id')
  @RequirePermissions('startup:read')
  get(@Param('id') id: string) {
    return this.startups.get(id);
  }

  @Post()
  @RequirePermissions('startup:create')
  create(
    @Body()
    body: {
      name: string;
      incubatorId?: string;
      ownerUserId?: string | null;
    },
  ) {
    return this.startups.create(body);
  }

  @Patch(':id')
  @RequirePermissions('startup:update')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      incubatorId?: string;
      ownerUserId?: string | null;
    },
  ) {
    return this.startups.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('startup:delete')
  async remove(@Param('id') id: string): Promise<void> {
    await this.startups.remove(id);
  }
}
