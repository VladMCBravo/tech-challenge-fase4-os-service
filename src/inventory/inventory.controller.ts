import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { ReverseMovementDto } from './dto/reverse-movement.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { StockEntryDto } from './dto/stock-entry.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('inventory-items')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um novo item de estoque' })
  create(@Body() createInventoryItemDto: CreateInventoryItemDto) {
    return this.inventoryService.create(createInventoryItemDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista todos os itens de estoque' })
  findAll() {
    return this.inventoryService.findAll();
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Lista itens com estoque baixo' })
  findLowStock() {
    return this.inventoryService.findLowStock();
  }

  @Get(':id/movements')
  @ApiOperation({ summary: 'Lista movimentações de um item' })
  findMovements(@Param('id') id: string) {
    return this.inventoryService.findMovements(id);
  }

  @Post(':id/entries')
  @ApiOperation({ summary: 'Registra entrada de estoque' })
  addEntry(@Param('id') id: string, @Body() stockEntryDto: StockEntryDto) {
    return this.inventoryService.addEntry(id, stockEntryDto);
  }

  @Post(':id/adjustments')
  @ApiOperation({ summary: 'Registra ajuste de estoque' })
  adjustStock(
    @Param('id') id: string,
    @Body() stockAdjustmentDto: StockAdjustmentDto,
  ) {
    return this.inventoryService.adjustStock(id, stockAdjustmentDto);
  }

  @Post(':id/reversals/:movementId')
  @ApiOperation({ summary: 'Estorna uma movimentação de estoque' })
  reverseMovement(
    @Param('id') id: string,
    @Param('movementId') movementId: string,
    @Body() reverseMovementDto: ReverseMovementDto,
  ) {
    return this.inventoryService.reverseMovement(
      id,
      movementId,
      reverseMovementDto,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um item de estoque por ID' })
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualiza um item de estoque' })
  update(
    @Param('id') id: string,
    @Body() updateInventoryItemDto: UpdateInventoryItemDto,
  ) {
    return this.inventoryService.update(id, updateInventoryItemDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Inativa um item de estoque' })
  remove(@Param('id') id: string) {
    return this.inventoryService.remove(id);
  }
}