jest.mock('../shared/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../shared/prisma/prisma.service';
import { VehiclesService } from './vehicles.service';

describe('VehiclesService', () => {
  let service: VehiclesService;

  const prismaMock = {
    customer: {
      findUnique: jest.fn(),
    },
    vehicle: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehiclesService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<VehiclesService>(VehiclesService);
  });

  it('deve criar veículo com placa válida e cliente existente', async () => {
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      name: 'Maria',
    });

    prismaMock.vehicle.findUnique.mockResolvedValue(null);

    prismaMock.vehicle.create.mockResolvedValue({
      id: 'vehicle-1',
      plate: 'ABC1D23',
      customerId: 'customer-1',
    });

    const result = await service.create({
      customerId: 'customer-1',
      plate: 'abc1d23',
      brand: 'Toyota',
      model: 'Corolla',
      year: 2022,
      color: 'Prata',
      mileage: 45000,
    });

    expect(prismaMock.vehicle.create).toHaveBeenCalled();
    expect(result.plate).toBe('ABC1D23');
  });

  it('deve rejeitar criação quando cliente não existe', async () => {
    prismaMock.customer.findUnique.mockResolvedValue(null);

    await expect(
      service.create({
        customerId: 'missing-customer',
        plate: 'ABC1D23',
        brand: 'Toyota',
        model: 'Corolla',
        year: 2022,
        color: 'Prata',
        mileage: 45000,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deve rejeitar placa inválida', async () => {
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      name: 'Maria',
    });

    await expect(
      service.create({
        customerId: 'customer-1',
        plate: '1234567',
        brand: 'Toyota',
        model: 'Corolla',
        year: 2022,
        color: 'Prata',
        mileage: 45000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve rejeitar duplicidade de placa', async () => {
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      name: 'Maria',
    });

    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      plate: 'ABC1D23',
    });

    await expect(
      service.create({
        customerId: 'customer-1',
        plate: 'ABC1D23',
        brand: 'Toyota',
        model: 'Corolla',
        year: 2022,
        color: 'Prata',
        mileage: 45000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve listar veículos', async () => {
    prismaMock.vehicle.findMany.mockResolvedValue([
      { id: 'vehicle-1', plate: 'ABC1D23' },
      { id: 'vehicle-2', plate: 'BRA2E19' },
    ]);

    const result = await service.findAll();

    expect(result).toHaveLength(2);
  });

  it('deve retornar veículo por id', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      plate: 'ABC1D23',
    });

    const result = await service.findOne('vehicle-1');

    expect(result.id).toBe('vehicle-1');
  });

  it('deve buscar veículo por placa normalizada', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      plate: 'ABC1D23',
    });

    const result = await service.findByPlate('abc1d23');

    expect(prismaMock.vehicle.findUnique).toHaveBeenCalledWith({
      where: {
        plate: 'ABC1D23',
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            documentType: true,
            document: true,
          },
        },
      },
    });
    expect(result.plate).toBe('ABC1D23');
  });

  it('deve listar veículos por cliente', async () => {
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      name: 'Maria',
    });

    prismaMock.vehicle.findMany.mockResolvedValue([
      { id: 'vehicle-1', customerId: 'customer-1' },
    ]);

    const result = await service.findByCustomer('customer-1');

    expect(result).toHaveLength(1);
  });

  it('deve atualizar veículo com sucesso', async () => {
    prismaMock.vehicle.findUnique
      .mockResolvedValueOnce({
        id: 'vehicle-1',
        customerId: 'customer-1',
        plate: 'ABC1D23',
      })
      .mockResolvedValueOnce(null);

    prismaMock.vehicle.update.mockResolvedValue({
      id: 'vehicle-1',
      plate: 'BRA2E19',
      brand: 'Toyota',
      model: 'Corolla',
      year: 2022,
    });

    const result = await service.update('vehicle-1', {
      plate: 'bra2e19',
      brand: 'Toyota',
    });

    expect(prismaMock.vehicle.update).toHaveBeenCalled();
    expect(result.plate).toBe('BRA2E19');
  });

  it('deve rejeitar update com placa duplicada', async () => {
    prismaMock.vehicle.findUnique
      .mockResolvedValueOnce({
        id: 'vehicle-1',
        customerId: 'customer-1',
        plate: 'ABC1D23',
      })
      .mockResolvedValueOnce({
        id: 'vehicle-2',
        plate: 'BRA2E19',
      });

    await expect(
      service.update('vehicle-1', {
        plate: 'BRA2E19',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve rejeitar update com placa inválida', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      customerId: 'customer-1',
      plate: 'ABC1D23',
    });

    await expect(
      service.update('vehicle-1', {
        plate: '1234567',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve inativar veículo', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      plate: 'ABC1D23',
    });

    prismaMock.vehicle.update.mockResolvedValue({
      id: 'vehicle-1',
      isActive: false,
    });

    const result = await service.remove('vehicle-1');

    expect(prismaMock.vehicle.update).toHaveBeenCalled();
    expect(result.isActive).toBe(false);
  });
});