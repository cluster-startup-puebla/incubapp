import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ApiStandardErrors } from '../common/openapi/api-standard-errors.decorator.js';
import { HealthReadinessResponseDto } from './health-readiness-response.dto.js';
import { HealthResponseDto } from './health-response.dto.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@ApiStandardErrors()
@AllowAnonymous()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth(): HealthResponseDto {
    return this.healthService.liveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (Postgres + Redis)' })
  @ApiOkResponse({ type: HealthReadinessResponseDto })
  getReadiness(): Promise<HealthReadinessResponseDto> {
    return this.healthService.readiness();
  }
}
