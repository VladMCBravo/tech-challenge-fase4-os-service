// src/work-orders/dto/approve-budget-webhook.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class ApproveBudgetWebhookDto {
  @ApiProperty({ example: 'id-da-ordem-de-servico' })
  @IsString()
  @IsNotEmpty()
  workOrderId!: string;

  @ApiProperty({ example: true, description: 'True para aprovar, False para rejeitar' })
  @IsBoolean()
  @IsNotEmpty()
  approved!: boolean;
}