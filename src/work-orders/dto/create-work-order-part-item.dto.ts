import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateWorkOrderPartItemDto {
  @ApiProperty({
    example: 'cmnub6vl90000d44n617g66kg',
  })
  @IsString()
  inventoryItemId!: string;

  @ApiProperty({
    example: 2,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  plannedQuantity!: number;

  @ApiPropertyOptional({
    example: 'Previsto para troca no diagnóstico',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}