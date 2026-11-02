import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class StockAdjustmentDto {
  @ApiProperty({
    example: 8,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  newQuantity!: number;

  @ApiPropertyOptional({
    example: 'Ajuste após contagem física',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}