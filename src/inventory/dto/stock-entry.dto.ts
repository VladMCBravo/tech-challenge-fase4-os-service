import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class StockEntryDto {
  @ApiProperty({
    example: 5,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity!: number;

  @ApiPropertyOptional({
    example: 'Reposição de estoque',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}