jest.mock('../shared/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ServicesService } from './services.service';

describe('ServicesService', () => {
  let service: ServicesService;

  const prismaMock = {
    service: {
      findFirst: jest.fn(),
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
        ServicesService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<ServicesService>(ServicesService);
  });

  it('deve criar serviço com nome único', async () => {
    prismaMock.service.findFirst.mockResolvedValue(null);
    prismaMock.service.create.mockResolvedValue({
      id: 'service-1',
      name: 'Troca de óleo',
      basePrice: 199.9,
    });

    const result = await service.create({
      name: 'Troca de óleo',
      description: 'Troca de óleo do motor',
      basePrice: 199.9,
      estimatedTimeMinutes: 60,
    });

    expect(prismaMock.service.create).toHaveBeenCalled();
    expect(result.name).toBe('Troca de óleo');
  });

  it('deve rejeitar duplicidade de nome', async () => {
    prismaMock.service.findFirst.mockResolvedValue({
      id: 'service-1',
      name: 'Troca de óleo',
    });

    await expect(
      service.create({
        name: 'Troca de óleo',
        description: 'Troca de óleo do motor',
        basePrice: 199.9,
        estimatedTimeMinutes: 60,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve listar todos os serviços', async () => {
    prismaMock.service.findMany.mockResolvedValue([
      { id: 'service-1', name: 'Troca de óleo' },
      { id: 'service-2', name: 'Alinhamento' },
    ]);

    const result = await service.findAll();

    expect(result).toHaveLength(2);
  });

  it('deve listar apenas serviços ativos', async () => {
    prismaMock.service.findMany.mockResolvedValue([
      { id: 'service-1', name: 'Troca de óleo', isActive: true },
    ]);

    const result = await service.findActive();

    expect(result).toHaveLength(1);
    expect(result[0].isActive).toBe(true);
  });

  it('deve retornar serviço por id', async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      id: 'service-1',
      name: 'Troca de óleo',
    });

    const result = await service.findOne('service-1');

    expect(result.id).toBe('service-1');
  });

  it('deve lançar erro ao buscar serviço inexistente', async () => {
    prismaMock.service.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deve atualizar serviço quando id existe e nome não conflita', async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      id: 'service-1',
      name: 'Troca de óleo',
    });

    prismaMock.service.findFirst.mockResolvedValue(null);

    prismaMock.service.update.mockResolvedValue({
      id: 'service-1',
      name: 'Troca de óleo premium',
    });

    const result = await service.update('service-1', {
      name: 'Troca de óleo premium',
      description: 'Descrição nova',
      basePrice: 249.9,
      estimatedTimeMinutes: 90,
    });

    expect(prismaMock.service.update).toHaveBeenCalled();
    expect(result.name).toBe('Troca de óleo premium');
  });

  it('deve rejeitar update quando nome conflita com outro serviço', async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      id: 'service-1',
      name: 'Troca de óleo',
    });

    prismaMock.service.findFirst.mockResolvedValue({
      id: 'service-2',
      name: 'Troca de óleo premium',
    });

    await expect(
      service.update('service-1', {
        name: 'Troca de óleo premium',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve inativar serviço existente', async () => {
    prismaMock.service.findUnique.mockResolvedValue({
      id: 'service-1',
      name: 'Troca de óleo',
      isActive: true,
    });

    prismaMock.service.update.mockResolvedValue({
      id: 'service-1',
      name: 'Troca de óleo',
      isActive: false,
    });

    const result = await service.remove('service-1');

    expect(prismaMock.service.update).toHaveBeenCalled();
    expect(result.isActive).toBe(false);
  });
});