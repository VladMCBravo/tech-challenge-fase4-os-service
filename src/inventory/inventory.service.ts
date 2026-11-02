import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryItemType,
  InventoryMovementType,
} from '../generated/prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { ReverseMovementDto } from './dto/reverse-movement.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { StockEntryDto } from './dto/stock-entry.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createInventoryItemDto: CreateInventoryItemDto) {
    const normalizedCode = createInventoryItemDto.code.trim().toUpperCase();

    const existingItem = await this.prisma.inventoryItem.findUnique({
      where: {
        code: normalizedCode,
      },
    });

    if (existingItem) {
      throw new BadRequestException(
        'Já existe um item de estoque cadastrado com este código.',
      );
    }

    return this.prisma.inventoryItem.create({
      data: {
        code: normalizedCode,
        name: createInventoryItemDto.name.trim(),
        description: createInventoryItemDto.description?.trim(),
        itemType: createInventoryItemDto.itemType,
        unitPrice: createInventoryItemDto.unitPrice,
        quantityAvailable: createInventoryItemDto.quantityAvailable ?? 0,
        minimumQuantity: createInventoryItemDto.minimumQuantity ?? 0,
      },
    });
  }

  async findAll() {
    return this.prisma.inventoryItem.findMany({
      include: {
        movements: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        movements: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item de estoque não encontrado.');
    }

    return item;
  }

  async findLowStock() {
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return items.filter(
      (item) => item.quantityAvailable <= item.minimumQuantity,
    );
  }

  async findMovements(id: string) {
    await this.ensureInventoryItemExists(id);

    return this.prisma.inventoryMovement.findMany({
      where: {
        inventoryItemId: id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async update(id: string, updateInventoryItemDto: UpdateInventoryItemDto) {
    const currentItem = await this.prisma.inventoryItem.findUnique({
      where: { id },
    });

    if (!currentItem) {
      throw new NotFoundException('Item de estoque não encontrado.');
    }

    let normalizedCode: string | undefined = undefined;

    if (updateInventoryItemDto.code) {
      normalizedCode = updateInventoryItemDto.code.trim().toUpperCase();

      const existingItem = await this.prisma.inventoryItem.findUnique({
        where: {
          code: normalizedCode,
        },
      });

      if (existingItem && existingItem.id !== id) {
        throw new BadRequestException(
          'Já existe um item de estoque cadastrado com este código.',
        );
      }
    }

    return this.prisma.inventoryItem.update({
      where: { id },
      data: {
        code: normalizedCode,
        name: updateInventoryItemDto.name?.trim(),
        description: updateInventoryItemDto.description?.trim(),
        itemType: updateInventoryItemDto.itemType,
        unitPrice: updateInventoryItemDto.unitPrice,
        quantityAvailable: updateInventoryItemDto.quantityAvailable,
        minimumQuantity: updateInventoryItemDto.minimumQuantity,
      },
    });
  }

  async remove(id: string) {
    await this.ensureInventoryItemExists(id);

    return this.prisma.inventoryItem.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
  }

  async addEntry(id: string, stockEntryDto: StockEntryDto) {
    const item = await this.ensureInventoryItemExists(id);

    return this.prisma.$transaction(async (tx) => {
      const updatedItem = await tx.inventoryItem.update({
        where: { id },
        data: {
          quantityAvailable: item.quantityAvailable + stockEntryDto.quantity,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: id,
          movementType: InventoryMovementType.ENTRY,
          quantity: stockEntryDto.quantity,
          notes: stockEntryDto.notes?.trim(),
        },
      });

      return updatedItem;
    });
  }

  async adjustStock(id: string, stockAdjustmentDto: StockAdjustmentDto) {
    const item = await this.ensureInventoryItemExists(id);

    const previousQuantity = item.quantityAvailable;
    const newQuantity = stockAdjustmentDto.newQuantity;
    const difference = Math.abs(newQuantity - previousQuantity);

    return this.prisma.$transaction(async (tx) => {
      const updatedItem = await tx.inventoryItem.update({
        where: { id },
        data: {
          quantityAvailable: newQuantity,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: id,
          movementType: InventoryMovementType.ADJUSTMENT,
          quantity: difference,
          notes:
            stockAdjustmentDto.notes?.trim() ??
            `Ajuste de estoque: ${previousQuantity} -> ${newQuantity}`,
        },
      });

      return updatedItem;
    });
  }

  async reverseMovement(
    id: string,
    movementId: string,
    reverseMovementDto: ReverseMovementDto,
  ) {
    const item = await this.ensureInventoryItemExists(id);

    const movement = await this.prisma.inventoryMovement.findFirst({
      where: {
        id: movementId,
        inventoryItemId: id,
      },
    });

    if (!movement) {
      throw new NotFoundException('Movimentação não encontrada.');
    }

    if (movement.movementType === InventoryMovementType.REVERSAL) {
      throw new BadRequestException(
        'Não é permitido estornar uma movimentação de estorno.',
      );
    }

    if (movement.movementType === InventoryMovementType.ADJUSTMENT) {
      throw new BadRequestException(
        'Para o MVP, o estorno de ajuste não está habilitado.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let newQuantity = item.quantityAvailable;

      if (movement.movementType === InventoryMovementType.ENTRY) {
        newQuantity = item.quantityAvailable - movement.quantity;

        if (newQuantity < 0) {
          throw new BadRequestException(
            'Não é possível estornar a entrada porque o saldo ficaria negativo.',
          );
        }
      }

      if (movement.movementType === InventoryMovementType.DECREASE) {
        newQuantity = item.quantityAvailable + movement.quantity;
      }

      const updatedItem = await tx.inventoryItem.update({
        where: { id },
        data: {
          quantityAvailable: newQuantity,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: id,
          movementType: InventoryMovementType.REVERSAL,
          quantity: movement.quantity,
          referenceType: 'inventory_movement',
          referenceId: movement.id,
          notes:
            reverseMovementDto.notes?.trim() ??
            `Estorno da movimentação ${movement.id}`,
        },
      });

      return updatedItem;
    });
  }

  private async ensureInventoryItemExists(id: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException('Item de estoque não encontrado.');
    }

    return item;
  }
}