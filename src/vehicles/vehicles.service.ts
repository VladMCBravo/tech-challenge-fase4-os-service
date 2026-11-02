import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import {
  isValidVehiclePlate,
  normalizePlate,
} from '../shared/validators/plate.validator';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createVehicleDto: CreateVehicleDto) {
    await this.ensureCustomerExists(createVehicleDto.customerId);

    const normalizedPlate = normalizePlate(createVehicleDto.plate);
    this.validatePlate(normalizedPlate);

    const existingVehicle = await this.prisma.vehicle.findUnique({
      where: {
        plate: normalizedPlate,
      },
    });

    if (existingVehicle) {
      throw new BadRequestException(
        'Já existe um veículo cadastrado com esta placa.',
      );
    }

    return this.prisma.vehicle.create({
      data: {
        customerId: createVehicleDto.customerId,
        plate: normalizedPlate,
        brand: createVehicleDto.brand,
        model: createVehicleDto.model,
        year: createVehicleDto.year,
        color: createVehicleDto.color,
        mileage: createVehicleDto.mileage,
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
  }

  async findAll() {
    return this.prisma.vehicle.findMany({
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
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

    if (!vehicle) {
      throw new NotFoundException('Veículo não encontrado.');
    }

    return vehicle;
  }

  async findByPlate(plate: string) {
    const normalizedPlate = normalizePlate(plate);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: {
        plate: normalizedPlate,
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

    if (!vehicle) {
      throw new NotFoundException('Veículo não encontrado.');
    }

    return vehicle;
  }

  async findByCustomer(customerId: string) {
    await this.ensureCustomerExists(customerId);

    return this.prisma.vehicle.findMany({
      where: {
        customerId,
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async update(id: string, updateVehicleDto: UpdateVehicleDto) {
    const currentVehicle = await this.prisma.vehicle.findUnique({
      where: { id },
    });

    if (!currentVehicle) {
      throw new NotFoundException('Veículo não encontrado.');
    }

    if (updateVehicleDto.customerId) {
      await this.ensureCustomerExists(updateVehicleDto.customerId);
    }

    let normalizedPlate: string | undefined = undefined;

    if (updateVehicleDto.plate) {
      normalizedPlate = normalizePlate(updateVehicleDto.plate);
      this.validatePlate(normalizedPlate);

      const existingVehicle = await this.prisma.vehicle.findUnique({
        where: {
          plate: normalizedPlate,
        },
      });

      if (existingVehicle && existingVehicle.id !== id) {
        throw new BadRequestException(
          'Já existe um veículo cadastrado com esta placa.',
        );
      }
    }

    return this.prisma.vehicle.update({
      where: { id },
      data: {
        customerId: updateVehicleDto.customerId,
        plate: normalizedPlate,
        brand: updateVehicleDto.brand,
        model: updateVehicleDto.model,
        year: updateVehicleDto.year,
        color: updateVehicleDto.color,
        mileage: updateVehicleDto.mileage,
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
  }

  async remove(id: string) {
    await this.ensureVehicleExists(id);

    return this.prisma.vehicle.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
  }

  private validatePlate(plate: string): void {
    if (!isValidVehiclePlate(plate)) {
      throw new BadRequestException('Placa inválida.');
    }
  }

  private async ensureCustomerExists(customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado.');
    }
  }

  private async ensureVehicleExists(id: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
    });

    if (!vehicle) {
      throw new NotFoundException('Veículo não encontrado.');
    }
  }
}