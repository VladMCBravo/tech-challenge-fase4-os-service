import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateWorkOrderDto {
  @ApiProperty({
    example: 'cmnu9tybj0001ys4ner108uav',
  })
  @IsString()
  customerId!: string;

  @ApiProperty({
    example: 'cmnua5b4w00007k4n3j4s1ysa',
  })
  @IsString()
  vehicleId!: string;

  @ApiPropertyOptional({
    example: 'Cliente relatou barulho no motor',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  initialNotes?: string;
}