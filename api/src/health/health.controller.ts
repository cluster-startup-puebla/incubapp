import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { HealthReadinessResponseDto } from './health-readiness-response.dto.js';
import { HealthResponseDto } from './health-response.dto.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@AllowAnonymous()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth(): HealthResponseDto {
    return this.healthService.liveness();
  }

  @Get('ready')
  @ApiOkResponse({ type: HealthReadinessResponseDto })
  getReadiness(): Promise<HealthReadinessResponseDto> {
    return this.healthService.readiness();
  }
}
