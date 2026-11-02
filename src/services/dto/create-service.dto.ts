import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateServiceDto {
  @ApiProperty({
    example: 'Troca de óleo',
  })
  @IsString()
  @MinLength(3)
  name!: string;

  @ApiPropertyOptional({
    example: 'Troca de óleo do motor com filtro',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 199.9,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice!: number;

  @ApiPropertyOptional({
    example: 60,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  estimatedTimeMinutes?: number;
}