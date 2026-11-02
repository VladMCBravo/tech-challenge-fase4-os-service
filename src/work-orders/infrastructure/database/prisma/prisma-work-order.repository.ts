// src/work-orders/infrastructure/database/prisma/prisma-work-order.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { IWorkOrderRepository } from '../../../domain/repositories/work-order.repository.interface';
import { WorkOrder } from '../../../domain/entities/work-order.entity';

@Injectable()
export class PrismaWorkOrderRepository implements IWorkOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(workOrder: WorkOrder): Promise<WorkOrder> {
    return this.prisma.workOrder.create({
      data: {
        code: workOrder.code,
        customerId: workOrder.customerId,
        vehicleId: workOrder.vehicleId,
        initialNotes: workOrder.initialNotes,
        status: workOrder.status,
      },
    }) as unknown as WorkOrder; // O cast pode ser necessário dependendo dos seus includes
  }

  // 👇 Adicione este método para satisfazer a interface
  async findById(id: string): Promise<WorkOrder | null> {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id },
    });
    return workOrder as unknown as WorkOrder | null;
  }

  async findTracking(code: string, document: string): Promise<any> {
    // Removemos a formatação para pegar apenas números do documento
    const normalizedDocument = document.replace(/\D/g, ''); 

    return this.prisma.workOrder.findFirst({
      where: {
        code,
        customer: {
          document: normalizedDocument,
        },
      },
      include: {
        customer: true,
        vehicle: true,
      },
    });
  }

  async listActiveWithPriority(): Promise<any[]> {
    // 1. Busca ignorando os "deletados logicamente" (DELIVERED, FINISHED, CANCELLED)
    const activeOrders = await this.prisma.workOrder.findMany({
      where: {
        status: {
          notIn: ['DELIVERED', 'FINISHED', 'CANCELLED'] as any,
        },
      },
      include: { customer: true, vehicle: true }, // inclua o que precisar
    });

    // 2. Ordenação customizada exigida pelo Tech Challenge
    const priority = {
      'IN_EXECUTION': 1,
      'WAITING_APPROVAL': 2,
      'IN_DIAGNOSIS': 3,
      'RECEIVED': 4,
      'FINISHED': 5,
    };

    return activeOrders.sort((a, b) => {
      const pA = priority[a.status] || 99;
      const pB = priority[b.status] || 99;
      return pA - pB;
    });
  }

  async updateStatus(id: string, status: string): Promise<any> {
    return this.prisma.workOrder.update({
      where: { id },
      data: { status: status as any }, // Usamos 'as any' caso o TypeScript reclame do Enum
    });
  }
}