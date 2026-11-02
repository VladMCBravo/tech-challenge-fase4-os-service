import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateVehicleDto {
  @ApiProperty({
    example: 'cmnu9tybj0001ys4ner108uav',
  })
  @IsString()
  customerId!: string;

  @ApiProperty({
    example: 'ABC1D23',
  })
  @IsString()
  @MinLength(7)
  plate!: string;

  @ApiProperty({
    example: 'Toyota',
  })
  @IsString()
  @MinLength(2)
  brand!: string;

  @ApiProperty({
    example: 'Corolla',
  })
  @IsString()
  @MinLength(2)
  model!: string;

  @ApiProperty({
    example: 2022,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  year!: number;

  @ApiPropertyOptional({
    example: 'Prata',
  })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({
    example: 45000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  mileage?: number;
}