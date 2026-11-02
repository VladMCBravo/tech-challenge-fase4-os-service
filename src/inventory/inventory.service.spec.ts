jest.mock('../shared/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () => ({
  InventoryItemType: {
    PART: 'PART',
    SUPPLY: 'SUPPLY',
  },
  InventoryMovementType: {
    ENTRY: 'ENTRY',
    DECREASE: 'DECREASE',
    ADJUSTMENT: 'ADJUSTMENT',
    REVERSAL: 'REVERSAL',
  },
}));

import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../shared/prisma/prisma.service';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;

  const txMock = {
    inventoryItem: {
      update: jest.fn(),
    },
    inventoryMovement: {
      create: jest.fn(),
    },
  };

  const prismaMock = {
    $transaction: jest.fn(async (callback: (tx: typeof txMock) => unknown) =>
      callback(txMock),
    ),
    inventoryItem: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    inventoryMovement: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
  jest.resetAllMocks();

  txMock.inventoryItem.update.mockReset();
  txMock.inventoryMovement.create.mockReset();

  prismaMock.$transaction.mockImplementation(
    async (callback: (tx: typeof txMock) => unknown) => callback(txMock),
  );

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      InventoryService,
      {
        provide: PrismaService,
        useValue: prismaMock,
      },
    ],
  }).compile();

  service = module.get<InventoryService>(InventoryService);
});

  it('deve criar item de estoque com código normalizado', async () => {
    prismaMock.inventoryItem.findUnique.mockResolvedValue(null);
    prismaMock.inventoryItem.create.mockResolvedValue({
      id: 'item-1',
      code: 'OLEO-5W30',
      name: 'Óleo 5W30',
      itemType: 'SUPPLY',
    });

    const result = await service.create({
      code: 'oleo-5w30',
      name: 'Óleo 5W30',
      description: 'Óleo sintético',
      itemType: 'SUPPLY' as any,
      unitPrice: 49.9,
      quantityAvailable: 10,
      minimumQuantity: 2,
    });

    expect(prismaMock.inventoryItem.create).toHaveBeenCalled();
    expect(result.code).toBe('OLEO-5W30');
  });

  it('deve rejeitar duplicidade de código', async () => {
    prismaMock.inventoryItem.findUnique.mockResolvedValue({
      id: 'item-1',
      code: 'OLEO-5W30',
    });

    await expect(
      service.create({
        code: 'oleo-5w30',
        name: 'Óleo 5W30',
        description: 'Óleo sintético',
        itemType: 'SUPPLY' as any,
        unitPrice: 49.9,
        quantityAvailable: 10,
        minimumQuantity: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve retornar item por id', async () => {
    prismaMock.inventoryItem.findUnique.mockResolvedValue({
      id: 'item-1',
      code: 'OLEO-5W30',
      movements: [],
    });

    const result = await service.findOne('item-1');

    expect(result.id).toBe('item-1');
  });

  it('deve lançar erro ao buscar item inexistente', async () => {
    prismaMock.inventoryItem.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deve listar itens com estoque baixo', async () => {
    prismaMock.inventoryItem.findMany.mockResolvedValue([
      {
        id: 'item-1',
        quantityAvailable: 2,
        minimumQuantity: 2,
        isActive: true,
      },
      {
        id: 'item-2',
        quantityAvailable: 1,
        minimumQuantity: 3,
        isActive: true,
      },
      {
        id: 'item-3',
        quantityAvailable: 10,
        minimumQuantity: 2,
        isActive: true,
      },
    ]);

    const result = await service.findLowStock();

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.id)).toEqual(['item-1', 'item-2']);
  });

  it('deve registrar entrada de estoque', async () => {
    prismaMock.inventoryItem.findUnique.mockResolvedValue({
      id: 'item-1',
      quantityAvailable: 8,
    });

    txMock.inventoryItem.update.mockResolvedValue({
      id: 'item-1',
      quantityAvailable: 13,
    });

    txMock.inventoryMovement.create.mockResolvedValue({
      id: 'movement-1',
      movementType: 'ENTRY',
      quantity: 5,
    });

    const result = await service.addEntry('item-1', {
      quantity: 5,
      notes: 'Reposição',
    });

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(txMock.inventoryItem.update).toHaveBeenCalled();
    expect(txMock.inventoryMovement.create).toHaveBeenCalled();
    expect(result.quantityAvailable).toBe(13);
  });

  it('deve registrar ajuste de estoque', async () => {
    prismaMock.inventoryItem.findUnique.mockResolvedValue({
      id: 'item-1',
      quantityAvailable: 10,
    });

    txMock.inventoryItem.update.mockResolvedValue({
      id: 'item-1',
      quantityAvailable: 8,
    });

    txMock.inventoryMovement.create.mockResolvedValue({
      id: 'movement-1',
      movementType: 'ADJUSTMENT',
      quantity: 2,
    });

    const result = await service.adjustStock('item-1', {
      newQuantity: 8,
      notes: 'Ajuste após contagem',
    });

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(txMock.inventoryItem.update).toHaveBeenCalled();
    expect(txMock.inventoryMovement.create).toHaveBeenCalled();
    expect(result.quantityAvailable).toBe(8);
  });

  it('deve rejeitar estorno de movimentação de estorno', async () => {
    prismaMock.inventoryItem.findUnique.mockResolvedValue({
      id: 'item-1',
      quantityAvailable: 8,
    });

    prismaMock.inventoryMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      inventoryItemId: 'item-1',
      movementType: 'REVERSAL',
      quantity: 2,
    });

    await expect(
      service.reverseMovement('item-1', 'movement-1', {
        notes: 'Estorno',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve rejeitar estorno de ajuste no MVP', async () => {
    prismaMock.inventoryItem.findUnique.mockResolvedValue({
      id: 'item-1',
      quantityAvailable: 8,
    });

    prismaMock.inventoryMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      inventoryItemId: 'item-1',
      movementType: 'ADJUSTMENT',
      quantity: 2,
    });

    await expect(
      service.reverseMovement('item-1', 'movement-1', {
        notes: 'Estorno',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve estornar uma entrada quando o saldo continuar válido', async () => {
    prismaMock.inventoryItem.findUnique.mockResolvedValue({
      id: 'item-1',
      quantityAvailable: 8,
    });

    prismaMock.inventoryMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      inventoryItemId: 'item-1',
      movementType: 'ENTRY',
      quantity: 3,
    });

    txMock.inventoryItem.update.mockResolvedValue({
      id: 'item-1',
      quantityAvailable: 5,
    });

    txMock.inventoryMovement.create.mockResolvedValue({
      id: 'movement-2',
      movementType: 'REVERSAL',
      quantity: 3,
    });

    const result = await service.reverseMovement('item-1', 'movement-1', {
      notes: 'Estorno da entrada',
    });

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(txMock.inventoryItem.update).toHaveBeenCalled();
    expect(txMock.inventoryMovement.create).toHaveBeenCalled();
    expect(result.quantityAvailable).toBe(5);
  });

  it('deve rejeitar estorno de entrada quando saldo ficaria negativo', async () => {
    prismaMock.inventoryItem.findUnique.mockResolvedValue({
      id: 'item-1',
      quantityAvailable: 2,
    });

    prismaMock.inventoryMovement.findFirst.mockResolvedValue({
      id: 'movement-1',
      inventoryItemId: 'item-1',
      movementType: 'ENTRY',
      quantity: 5,
    });

    await expect(
      service.reverseMovement('item-1', 'movement-1', {
        notes: 'Estorno da entrada',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve listar todos os itens de estoque', async () => {
  prismaMock.inventoryItem.findMany.mockResolvedValue([
    { id: 'item-1', code: 'OLEO-5W30' },
    { id: 'item-2', code: 'FILTRO-AR-001' },
  ]);

  const result = await service.findAll();

  expect(result).toHaveLength(2);
});

it('deve listar movimentações de um item existente', async () => {
  prismaMock.inventoryItem.findUnique.mockResolvedValue({
    id: 'item-1',
    code: 'OLEO-5W30',
  });

  prismaMock.inventoryMovement.findMany.mockResolvedValue([
    { id: 'movement-1', movementType: 'ENTRY', quantity: 5 },
  ]);

  const result = await service.findMovements('item-1');

  expect(result).toHaveLength(1);
  expect(prismaMock.inventoryMovement.findMany).toHaveBeenCalled();
});

it('deve atualizar item de estoque com sucesso', async () => {
  prismaMock.inventoryItem.findUnique
    .mockResolvedValueOnce({
      id: 'item-1',
      code: 'OLEO-5W30',
    })
    .mockResolvedValueOnce(null);

  prismaMock.inventoryItem.update.mockResolvedValue({
    id: 'item-1',
    code: 'OLEO-5W40',
    name: 'Óleo 5W40',
  });

  const result = await service.update('item-1', {
    code: 'oleo-5w40',
    name: 'Óleo 5W40',
  });

  expect(prismaMock.inventoryItem.update).toHaveBeenCalled();
  expect(result.code).toBe('OLEO-5W40');
});

it('deve rejeitar update com código duplicado', async () => {
  prismaMock.inventoryItem.findUnique
    .mockResolvedValueOnce({
      id: 'item-1',
      code: 'OLEO-5W30',
    })
    .mockResolvedValueOnce({
      id: 'item-2',
      code: 'FILTRO-AR-001',
    });

  await expect(
    service.update('item-1', {
      code: 'FILTRO-AR-001',
    }),
  ).rejects.toBeInstanceOf(BadRequestException);
});

it('deve inativar item de estoque', async () => {
  prismaMock.inventoryItem.findUnique.mockResolvedValue({
    id: 'item-1',
    code: 'OLEO-5W30',
  });

  prismaMock.inventoryItem.update.mockResolvedValue({
    id: 'item-1',
    isActive: false,
  });

  const result = await service.remove('item-1');

  expect(prismaMock.inventoryItem.update).toHaveBeenCalled();
  expect(result.isActive).toBe(false);
});

it('deve lançar erro quando movimentação a estornar não existe', async () => {
  prismaMock.inventoryItem.findUnique.mockResolvedValue({
    id: 'item-1',
    quantityAvailable: 8,
  });

  prismaMock.inventoryMovement.findFirst.mockResolvedValue(null);

  await expect(
    service.reverseMovement('item-1', 'movement-missing', {
      notes: 'Estorno',
    }),
  ).rejects.toBeInstanceOf(NotFoundException);
});

it('deve estornar uma saída de estoque', async () => {
  prismaMock.inventoryItem.findUnique.mockResolvedValue({
    id: 'item-1',
    quantityAvailable: 8,
  });

  prismaMock.inventoryMovement.findFirst.mockResolvedValue({
    id: 'movement-1',
    inventoryItemId: 'item-1',
    movementType: 'DECREASE',
    quantity: 2,
  });

  txMock.inventoryItem.update.mockResolvedValue({
    id: 'item-1',
    quantityAvailable: 10,
  });

  txMock.inventoryMovement.create.mockResolvedValue({
    id: 'movement-2',
    movementType: 'REVERSAL',
    quantity: 2,
  });

  const result = await service.reverseMovement('item-1', 'movement-1', {
    notes: 'Estorno da saída',
  });

  expect(prismaMock.$transaction).toHaveBeenCalled();
  expect(result.quantityAvailable).toBe(10);
});
});