import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createServiceDto: CreateServiceDto) {
    const normalizedName = createServiceDto.name.trim();

    const existingService = await this.prisma.service.findFirst({
      where: {
        name: {
          equals: normalizedName,
          mode: 'insensitive',
        },
      },
    });

    if (existingService) {
      throw new BadRequestException(
        'Já existe um serviço cadastrado com este nome.',
      );
    }

    return this.prisma.service.create({
      data: {
        name: normalizedName,
        description: createServiceDto.description?.trim(),
        basePrice: createServiceDto.basePrice,
        estimatedTimeMinutes: createServiceDto.estimatedTimeMinutes,
      },
    });
  }

  async findAll() {
    return this.prisma.service.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findActive() {
    return this.prisma.service.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const service = await this.prisma.service.findUnique({
      where: { id },
    });

    if (!service) {
      throw new NotFoundException('Serviço não encontrado.');
    }

    return service;
  }

  async update(id: string, updateServiceDto: UpdateServiceDto) {
    const currentService = await this.prisma.service.findUnique({
      where: { id },
    });

    if (!currentService) {
      throw new NotFoundException('Serviço não encontrado.');
    }

    if (updateServiceDto.name) {
      const normalizedName = updateServiceDto.name.trim();

      const existingService = await this.prisma.service.findFirst({
        where: {
          name: {
            equals: normalizedName,
            mode: 'insensitive',
          },
        },
      });

      if (existingService && existingService.id !== id) {
        throw new BadRequestException(
          'Já existe um serviço cadastrado com este nome.',
        );
      }
    }

    return this.prisma.service.update({
      where: { id },
      data: {
        name: updateServiceDto.name?.trim(),
        description: updateServiceDto.description?.trim(),
        basePrice: updateServiceDto.basePrice,
        estimatedTimeMinutes: updateServiceDto.estimatedTimeMinutes,
      },
    });
  }

  async remove(id: string) {
    await this.ensureServiceExists(id);

    return this.prisma.service.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
  }

  private async ensureServiceExists(id: string): Promise<void> {
    const service = await this.prisma.service.findUnique({
      where: { id },
    });

    if (!service) {
      throw new NotFoundException('Serviço não encontrado.');
    }
  }
}