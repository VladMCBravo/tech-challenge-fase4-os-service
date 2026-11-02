import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateWorkOrderServiceItemDto {
  @ApiProperty({
    example: 'cmnuagwsc0000054nfrkozcp7',
  })
  @IsString()
  serviceId!: string;

  @ApiPropertyOptional({
    example: 'Troca de óleo com observação adicional',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;
}