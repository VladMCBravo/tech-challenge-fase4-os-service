jest.mock('../shared/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  let service: CustomersService;

  const prismaMock = {
    customer: {
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
        CustomersService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  it('deve criar cliente com documento válido e único', async () => {
    prismaMock.customer.findUnique.mockResolvedValue(null);
    prismaMock.customer.create.mockResolvedValue({
      id: 'customer-1',
      name: 'Maria',
      documentType: 'CPF',
      document: '52998224725',
    });

    const result = await service.create({
      name: 'Maria',
      documentType: 'CPF' as any,
      document: '529.982.247-25',
      phone: '13999999999',
      email: 'maria@email.com',
    });

    expect(prismaMock.customer.create).toHaveBeenCalled();
    expect(result.document).toBe('52998224725');
  });

  it('deve rejeitar documento inválido', async () => {
    await expect(
      service.create({
        name: 'Maria',
        documentType: 'CPF' as any,
        document: '529.982.247-24',
        phone: '13999999999',
        email: 'maria@email.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve rejeitar duplicidade de documento', async () => {
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      document: '52998224725',
    });

    await expect(
      service.create({
        name: 'Maria',
        documentType: 'CPF' as any,
        document: '529.982.247-25',
        phone: '13999999999',
        email: 'maria@email.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve listar clientes', async () => {
    prismaMock.customer.findMany.mockResolvedValue([
      { id: 'customer-1', name: 'Maria' },
      { id: 'customer-2', name: 'João' },
    ]);

    const result = await service.findAll();

    expect(result).toHaveLength(2);
  });

  it('deve retornar cliente por id', async () => {
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      name: 'Maria',
    });

    const result = await service.findOne('customer-1');

    expect(result.id).toBe('customer-1');
  });

  it('deve lançar erro ao buscar cliente inexistente', async () => {
    prismaMock.customer.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deve buscar cliente por documento normalizado', async () => {
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      name: 'Maria',
      document: '52998224725',
    });

    const result = await service.findByDocument('529.982.247-25');

    expect(prismaMock.customer.findUnique).toHaveBeenCalledWith({
      where: {
        document: '52998224725',
      },
    });
    expect(result.id).toBe('customer-1');
  });

  it('deve lançar erro ao buscar por documento inexistente', async () => {
    prismaMock.customer.findUnique.mockResolvedValue(null);

    await expect(
      service.findByDocument('529.982.247-25'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deve atualizar cliente com sucesso', async () => {
    prismaMock.customer.findUnique
      .mockResolvedValueOnce({
        id: 'customer-1',
        name: 'Maria',
        documentType: 'CPF',
        document: '52998224725',
      })
      .mockResolvedValueOnce({
        id: 'customer-1',
        name: 'Maria',
        documentType: 'CPF',
        document: '52998224725',
      });

    prismaMock.customer.update.mockResolvedValue({
      id: 'customer-1',
      name: 'Maria Oliveira',
      documentType: 'CPF',
      document: '52998224725',
      phone: '13999999999',
    });

    const result = await service.update('customer-1', {
      name: 'Maria Oliveira',
      phone: '13999999999',
    });

    expect(prismaMock.customer.update).toHaveBeenCalled();
    expect(result.name).toBe('Maria Oliveira');
  });

  it('deve rejeitar update com documento inválido', async () => {
    prismaMock.customer.findUnique
      .mockResolvedValueOnce({
        id: 'customer-1',
        name: 'Maria',
        documentType: 'CPF',
        document: '52998224725',
      })
      .mockResolvedValueOnce({
        id: 'customer-1',
        name: 'Maria',
        documentType: 'CPF',
        document: '52998224725',
      });

    await expect(
      service.update('customer-1', {
        document: '529.982.247-24',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve rejeitar update com documento duplicado', async () => {
    prismaMock.customer.findUnique
      .mockResolvedValueOnce({
        id: 'customer-1',
        name: 'Maria',
        documentType: 'CPF',
        document: '52998224725',
      })
      .mockResolvedValueOnce({
        id: 'customer-1',
        name: 'Maria',
        documentType: 'CPF',
        document: '52998224725',
      })
      .mockResolvedValueOnce({
        id: 'customer-2',
        name: 'João',
        documentType: 'CPF',
        document: '39053344705',
      });

    await expect(
      service.update('customer-1', {
        document: '390.533.447-05',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve inativar cliente', async () => {
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      name: 'Maria',
    });

    prismaMock.customer.update.mockResolvedValue({
      id: 'customer-1',
      isActive: false,
    });

    const result = await service.remove('customer-1');

    expect(prismaMock.customer.update).toHaveBeenCalled();
    expect(result.isActive).toBe(false);
  });
});