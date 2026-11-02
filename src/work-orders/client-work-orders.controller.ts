import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WorkOrdersService } from './work-orders.service';

@ApiTags('Client Tracking')
@Controller('client/work-orders')
export class ClientWorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Get(':code/tracking')
  @ApiOperation({ summary: 'Consulta pública do andamento da OS pelo cliente' })
  @ApiQuery({
    name: 'document',
    required: true,
    example: '52998224725',
  })
  getTracking(
    @Param('code') code: string,
    @Query('document') document: string,
  ) {
    return this.workOrdersService.getClientTracking(code, document);
  }
}