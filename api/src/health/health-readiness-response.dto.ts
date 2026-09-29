import { ApiProperty } from '@nestjs/swagger';

export class HealthReadinessResponseDto {
  @ApiProperty({ example: 'ok', type: String })
  status!: 'ok';

  @ApiProperty({ example: 'up', type: String })
  postgres!: 'up';

  @ApiProperty({ example: 'up', type: String })
  redis!: 'up';
}
