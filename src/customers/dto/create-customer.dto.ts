import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType } from '../../generated/prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({
    example: 'João da Silva',
  })
  @IsString()
  @MinLength(3)
  name!: string;

  @ApiProperty({
    enum: DocumentType,
    example: DocumentType.CPF,
  })
  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @ApiProperty({
    example: '123.456.789-09',
  })
  @IsString()
  document!: string;

  @ApiPropertyOptional({
    example: '(13) 99999-9999',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: 'joao@email.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}