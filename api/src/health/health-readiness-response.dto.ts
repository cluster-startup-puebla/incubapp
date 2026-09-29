import { ApiProperty } from '@nestjs/swagger';

export class HealthReadinessResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 'up' })
  postgres!: 'up';

  @ApiProperty({ example: 'up' })
  redis!: 'up';
}
