import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryItemType } from '../../generated/prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateInventoryItemDto {
  @ApiProperty({
    example: 'OLEO-5W30',
  })
  @IsString()
  @MinLength(2)
  code!: string;

  @ApiProperty({
    example: 'Óleo 5W30',
  })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({
    example: 'Óleo sintético para motor',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: InventoryItemType,
    example: InventoryItemType.SUPPLY,
  })
  @IsEnum(InventoryItemType)
  itemType!: InventoryItemType;

  @ApiProperty({
    example: 49.9,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional({
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  quantityAvailable?: number;

  @ApiPropertyOptional({
    example: 2,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  minimumQuantity?: number;
}