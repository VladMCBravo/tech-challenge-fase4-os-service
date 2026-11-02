import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
// 👇 Adicione o 'type' logo após o 'import'
import type { IWorkOrderRepository } from '../../domain/repositories/work-order.repository.interface';
import { CreateWorkOrderDto } from '../../dto/create-work-order.dto';
// 👇 Adicione o 'type' aqui também
import type { ICustomerRepository } from '../../domain/repositories/customer.repository.interface';
import type { IVehicleRepository } from '../../domain/repositories/vehicle.repository.interface';

@Injectable()
export class CreateWorkOrderUseCase {
  constructor(
    // Injetamos a interface (Porta), não o Prisma!
    private readonly workOrderRepository: IWorkOrderRepository, 
    private readonly customerRepository: ICustomerRepository,
    private readonly vehicleRepository: IVehicleRepository,
  ) {}

  async execute(dto: CreateWorkOrderDto) {
    const customer = await this.customerRepository.findById(dto.customerId);
    if (!customer) throw new NotFoundException('Cliente não encontrado.');

    const vehicle = await this.vehicleRepository.findById(dto.vehicleId);
    if (!vehicle) throw new NotFoundException('Veículo não encontrado.');

    if (vehicle.customerId !== dto.customerId) {
      throw new BadRequestException('O veículo informado não pertence ao cliente.');
    }

    // A lógica de gerar o código fica no domínio
    const newWorkOrder = {
        customerId: dto.customerId,
        vehicleId: dto.vehicleId,
        initialNotes: dto.initialNotes,
        code: `OS-${Date.now()}`,
        status: 'RECEIVED' as any, // Adicione o 'as any' temporariamente se der erro de Enum
    };

    return this.workOrderRepository.create(newWorkOrder);
  }
}