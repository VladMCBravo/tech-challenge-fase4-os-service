import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ReverseMovementDto {
  @ApiPropertyOptional({
    example: 'Estorno de movimentação incorreta',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}