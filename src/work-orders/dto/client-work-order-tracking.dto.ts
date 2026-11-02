import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ClientWorkOrderTrackingDto {
  @ApiProperty({
    example: '52998224725',
  })
  @IsString()
  @MinLength(11)
  document!: string;
}