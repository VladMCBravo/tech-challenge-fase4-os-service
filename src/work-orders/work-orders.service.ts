import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import {
  InventoryMovementType,
  WorkOrderStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { CreateWorkOrderPartItemDto } from './dto/create-work-order-part-item.dto';
import { CreateWorkOrderServiceItemDto } from './dto/create-work-order-service-item.dto';
import { UpdateWorkOrderPartItemDto } from './dto/update-work-order-part-item.dto';
import { UpdateWorkOrderServiceItemDto } from './dto/update-work-order-service-item.dto';
import { onlyDigits } from '../shared/validators/document.validator';
import { MetricsService } from '../observability/metrics.service';
import { RabbitMQService } from '../messaging/rabbitmq.service';
import {
  ExecutionFailedPayload,
  ExecutionFinishedPayload,
  PaymentApprovedPayload,
  PaymentFailedPayload,
  SagaEventPattern,
} from '../messaging/saga-events.interface';

@Injectable()
export class WorkOrdersService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    @Optional() private readonly rabbitMQ?: RabbitMQService,
  ) {}

  onModuleInit() {
    if (!this.rabbitMQ) return;

    this.rabbitMQ.registerHandler(
      SagaEventPattern.PAYMENT_APPROVED,
      async (payload: PaymentApprovedPayload) => {
        await this.startExecution(payload.workOrderId);
      },
    );

    this.rabbitMQ.registerHandler(
      SagaEventPattern.PAYMENT_FAILED,
      async (payload: PaymentFailedPayload) => {
        await this.compensateSagaFailure(payload.workOrderId, payload.reason);
      },
    );

    this.rabbitMQ.registerHandler(
      SagaEventPattern.EXECUTION_FINISHED,
      async (payload: ExecutionFinishedPayload) => {
        await this.finish(payload.workOrderId);
      },
    );

    this.rabbitMQ.registerHandler(
      SagaEventPattern.EXECUTION_FAILED,
      async (payload: ExecutionFailedPayload) => {
        await this.compensateSagaFailure(payload.workOrderId, payload.reason);
      },
    );
  }

  async create(createWorkOrderDto: CreateWorkOrderDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: createWorkOrderDto.customerId },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: createWorkOrderDto.vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Veículo não encontrado.');
    }

    if (vehicle.customerId !== createWorkOrderDto.customerId) {
      throw new BadRequestException(
        'O veículo informado não pertence ao cliente informado.',
      );
    }

    const code = this.generateWorkOrderCode();

    return this.prisma.workOrder.create({
      data: {
        code,
        customerId: createWorkOrderDto.customerId,
        vehicleId: createWorkOrderDto.vehicleId,
        initialNotes: createWorkOrderDto.initialNotes?.trim(),
        status: WorkOrderStatus.RECEIVED,
      },
      include: this.defaultInclude(),
    });
  }

  async findAll() {
    return this.prisma.workOrder.findMany({
      include: this.defaultInclude(),
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id },
      include: this.defaultInclude(),
    });

    if (!workOrder) {
      throw new NotFoundException('Ordem de serviço não encontrada.');
    }

    return workOrder;
  }

  async findByStatus(status: WorkOrderStatus) {
    return this.prisma.workOrder.findMany({
      where: { status },
      include: this.defaultInclude(),
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findByCustomer(customerId: string) {
    return this.prisma.workOrder.findMany({
      where: { customerId },
      include: this.defaultInclude(),
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findByVehicle(vehicleId: string) {
    return this.prisma.workOrder.findMany({
      where: { vehicleId },
      include: this.defaultInclude(),
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async addServiceItem(
    workOrderId: string,
    createDto: CreateWorkOrderServiceItemDto,
  ) {
    const workOrder = await this.ensureWorkOrderExists(workOrderId);
    this.ensureWorkOrderCanBeEdited(workOrder.status);

    const service = await this.prisma.service.findUnique({
      where: { id: createDto.serviceId },
    });

    if (!service) {
      throw new NotFoundException('Serviço não encontrado.');
    }

    if (!service.isActive) {
      throw new BadRequestException(
        'Não é permitido usar um serviço inativo.',
      );
    }

    const subtotal = Number(service.basePrice) * createDto.quantity;

    return this.prisma.workOrderServiceItem.create({
      data: {
        workOrderId,
        serviceId: createDto.serviceId,
        description:
          createDto.description?.trim() ?? service.description ?? service.name,
        unitPrice: service.basePrice,
        quantity: createDto.quantity,
        subtotal,
        estimatedTimeMinutes: service.estimatedTimeMinutes,
      },
      include: {
        service: true,
      },
    });
  }

  async updateServiceItem(
    workOrderId: string,
    itemId: string,
    updateDto: UpdateWorkOrderServiceItemDto,
  ) {
    const workOrder = await this.ensureWorkOrderExists(workOrderId);
    this.ensureWorkOrderCanBeEdited(workOrder.status);

    const currentItem = await this.prisma.workOrderServiceItem.findFirst({
      where: {
        id: itemId,
        workOrderId,
      },
      include: {
        service: true,
      },
    });

    if (!currentItem) {
      throw new NotFoundException('Item de serviço não encontrado.');
    }

    let service = currentItem.service;
    if (updateDto.serviceId) {
      const updatedService = await this.prisma.service.findUnique({
        where: { id: updateDto.serviceId },
      });

      if (!updatedService) {
        throw new NotFoundException('Serviço não encontrado.');
      }

      if (!updatedService.isActive) {
        throw new BadRequestException(
          'Não é permitido usar um serviço inativo.',
        );
      }

      service = updatedService;
    }

    const quantity = updateDto.quantity ?? currentItem.quantity;
    const subtotal = Number(service.basePrice) * quantity;

    return this.prisma.workOrderServiceItem.update({
      where: { id: itemId },
      data: {
        serviceId: updateDto.serviceId,
        description: updateDto.description?.trim() ?? currentItem.description,
        unitPrice: service.basePrice,
        quantity,
        subtotal,
        estimatedTimeMinutes: service.estimatedTimeMinutes,
      },
      include: {
        service: true,
      },
    });
  }

  async removeServiceItem(workOrderId: string, itemId: string) {
    const workOrder = await this.ensureWorkOrderExists(workOrderId);
    this.ensureWorkOrderCanBeEdited(workOrder.status);

    const item = await this.prisma.workOrderServiceItem.findFirst({
      where: {
        id: itemId,
        workOrderId,
      },
    });

    if (!item) {
      throw new NotFoundException('Item de serviço não encontrado.');
    }

    await this.prisma.workOrderServiceItem.delete({
      where: { id: itemId },
    });

    return { message: 'Item de serviço removido com sucesso.' };
  }

  async addPartItem(
    workOrderId: string,
    createDto: CreateWorkOrderPartItemDto,
  ) {
    const workOrder = await this.ensureWorkOrderExists(workOrderId);
    this.ensureWorkOrderCanBeEdited(workOrder.status);

    const inventoryItem = await this.prisma.inventoryItem.findUnique({
      where: { id: createDto.inventoryItemId },
    });

    if (!inventoryItem) {
      throw new NotFoundException('Item de estoque não encontrado.');
    }

    if (!inventoryItem.isActive) {
      throw new BadRequestException(
        'Não é permitido usar um item de estoque inativo.',
      );
    }

    const subtotal =
      Number(inventoryItem.unitPrice) * createDto.plannedQuantity;

    return this.prisma.workOrderPartItem.create({
      data: {
        workOrderId,
        inventoryItemId: createDto.inventoryItemId,
        itemType: inventoryItem.itemType,
        plannedQuantity: createDto.plannedQuantity,
        consumedQuantity: 0,
        unitPrice: inventoryItem.unitPrice,
        subtotal,
      },
      include: {
        inventoryItem: true,
      },
    });
  }

  async updatePartItem(
    workOrderId: string,
    itemId: string,
    updateDto: UpdateWorkOrderPartItemDto,
  ) {
    const workOrder = await this.ensureWorkOrderExists(workOrderId);
    this.ensureWorkOrderCanBeEdited(workOrder.status);

    const currentItem = await this.prisma.workOrderPartItem.findFirst({
      where: {
        id: itemId,
        workOrderId,
      },
      include: {
        inventoryItem: true,
      },
    });

    if (!currentItem) {
      throw new NotFoundException('Item de peça/insumo não encontrado.');
    }

    let inventoryItem = currentItem.inventoryItem;
    if (updateDto.inventoryItemId) {
      const updatedInventoryItem = await this.prisma.inventoryItem.findUnique({
        where: { id: updateDto.inventoryItemId },
      });

      if (!updatedInventoryItem) {
        throw new NotFoundException('Item de estoque não encontrado.');
      }

      if (!updatedInventoryItem.isActive) {
        throw new BadRequestException(
          'Não é permitido usar um item de estoque inativo.',
        );
      }

      inventoryItem = updatedInventoryItem;
    }

    const plannedQuantity =
      updateDto.plannedQuantity ?? currentItem.plannedQuantity;
    const subtotal = Number(inventoryItem.unitPrice) * plannedQuantity;

    return this.prisma.workOrderPartItem.update({
      where: { id: itemId },
      data: {
        inventoryItemId: updateDto.inventoryItemId,
        itemType: inventoryItem.itemType,
        plannedQuantity,
        unitPrice: inventoryItem.unitPrice,
        subtotal,
      },
      include: {
        inventoryItem: true,
      },
    });
  }

  async removePartItem(workOrderId: string, itemId: string) {
    const workOrder = await this.ensureWorkOrderExists(workOrderId);
    this.ensureWorkOrderCanBeEdited(workOrder.status);

    const item = await this.prisma.workOrderPartItem.findFirst({
      where: {
        id: itemId,
        workOrderId,
      },
    });

    if (!item) {
      throw new NotFoundException('Item de peça/insumo não encontrado.');
    }

    await this.prisma.workOrderPartItem.delete({
      where: { id: itemId },
    });

    return { message: 'Item de peça/insumo removido com sucesso.' };
  }

  async startDiagnosis(id: string) {
    const workOrder = await this.ensureWorkOrderExists(id);

    if (workOrder.status !== WorkOrderStatus.RECEIVED) {
      throw new BadRequestException(
        'Só é possível iniciar diagnóstico de uma OS recebida.',
      );
    }

    return this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.IN_DIAGNOSIS,
        diagnosisStartedAt: new Date(),
      },
      include: this.defaultInclude(),
    });
  }

  async moveToAwaitingApproval(id: string) {
    const workOrder = await this.ensureWorkOrderExists(id);

    if (workOrder.status !== WorkOrderStatus.IN_DIAGNOSIS) {
      throw new BadRequestException(
        'Só é possível mover para aguardando aprovação a partir do diagnóstico.',
      );
    }

    // Busca itens de serviço e peças (caso existam) para reservar estoque e disparar evento da Saga
    const partItems =
      (await this.prisma.workOrderPartItem?.findMany?.({
        where: { workOrderId: id },
        include: { inventoryItem: true },
      })) ?? [];

    const serviceItems =
      (await this.prisma.workOrderServiceItem?.findMany?.({
        where: { workOrderId: id },
      })) ?? [];

    // Reserva de estoque (Transação local da Saga no OS Service)
    for (const part of partItems) {
      if (
        part.inventoryItem &&
        part.inventoryItem.quantityAvailable < part.plannedQuantity
      ) {
        throw new BadRequestException(
          `Estoque insuficiente para o item ${part.inventoryItem.name ?? part.inventoryItemId}.`,
        );
      }
    }

    for (const part of partItems) {
      if (part.inventoryItem) {
        await this.prisma.inventoryItem?.update?.({
          where: { id: part.inventoryItemId },
          data: {
            quantityAvailable:
              part.inventoryItem.quantityAvailable - part.plannedQuantity,
          },
        });
        await this.prisma.inventoryMovement?.create?.({
          data: {
            inventoryItemId: part.inventoryItemId,
            movementType: InventoryMovementType.DECREASE,
            quantity: part.plannedQuantity,
            referenceType: 'WORK_ORDER',
            referenceId: id,
            notes: `Reserva de estoque Saga OS ${workOrder.code}`,
          },
        });
      }
    }

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.WAITING_APPROVAL,
      },
      include: this.defaultInclude(),
    });

    const servicesTotal = serviceItems.reduce(
      (sum, item) => sum + Number(item.subtotal),
      0,
    );
    const partsTotal = partItems.reduce(
      (sum, item) => sum + Number(item.subtotal),
      0,
    );
    const totalAmount = servicesTotal + partsTotal;

    await this.rabbitMQ?.publish(SagaEventPattern.OS_BUDGET_REQUESTED, {
      event: SagaEventPattern.OS_BUDGET_REQUESTED,
      workOrderId: id,
      workOrderCode: updated.code ?? workOrder.code,
      customerId: updated.customerId ?? workOrder.customerId,
      customerName: (updated as any).customer?.name,
      servicesTotal,
      partsTotal,
      totalAmount,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async startExecution(id: string) {
    const workOrder = await this.ensureWorkOrderExists(id);

    if (workOrder.status !== WorkOrderStatus.WAITING_APPROVAL) {
      throw new BadRequestException(
        'Só é possível iniciar execução a partir de aguardando aprovação.',
      );
    }

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.IN_EXECUTION,
        executionStartedAt: new Date(),
      },
      include: this.defaultInclude(),
    });

    if (workOrder.diagnosisStartedAt) {
      const segundos =
        (updated.executionStartedAt!.getTime() -
          workOrder.diagnosisStartedAt.getTime()) /
        1000;
      this.metrics.workOrderStageDuration('diagnostico', segundos);
    }
    this.metrics.workOrderStatusChanged('IN_EXECUTION');

    await this.rabbitMQ?.publish(SagaEventPattern.OS_EXECUTION_REQUESTED, {
      event: SagaEventPattern.OS_EXECUTION_REQUESTED,
      workOrderId: id,
      workOrderCode: updated.code ?? workOrder.code,
      customerId: updated.customerId ?? workOrder.customerId,
      vehicleId: updated.vehicleId ?? workOrder.vehicleId,
      services: ((updated as any).serviceItems ?? []).map((s: any) => ({
        serviceId: s.serviceId,
        description: s.description,
        quantity: s.quantity,
        estimatedTimeMinutes: s.estimatedTimeMinutes,
      })),
      parts: ((updated as any).partItems ?? []).map((p: any) => ({
        inventoryItemId: p.inventoryItemId,
        plannedQuantity: p.plannedQuantity,
      })),
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  /**
   * Compensação / Rollback da Saga Pattern:
   * Caso o pagamento seja recusado no Billing Service ou ocorra falha irrecorrível no Execution Service,
   * estorna automaticamente o estoque reservado e cancela a Ordem de Serviço.
   */
  async compensateSagaFailure(id: string, reason: string) {
    const workOrder = await this.ensureWorkOrderExists(id);

    if (workOrder.status === WorkOrderStatus.CANCELLED) {
      return workOrder;
    }

    const partItems =
      (await this.prisma.workOrderPartItem?.findMany?.({
        where: { workOrderId: id },
        include: { inventoryItem: true },
      })) ?? [];

    // Estorna peças reservadas se a OS já havia reservado estoque
    if (
      workOrder.status === WorkOrderStatus.WAITING_APPROVAL ||
      workOrder.status === WorkOrderStatus.IN_EXECUTION
    ) {
      for (const part of partItems) {
        if (part.inventoryItem) {
          await this.prisma.inventoryItem?.update?.({
            where: { id: part.inventoryItemId },
            data: {
              quantityAvailable:
                part.inventoryItem.quantityAvailable + part.plannedQuantity,
            },
          });
          await this.prisma.inventoryMovement?.create?.({
            data: {
              inventoryItemId: part.inventoryItemId,
              movementType: InventoryMovementType.REVERSAL,
              quantity: part.plannedQuantity,
              referenceType: 'SAGA_COMPENSATION',
              referenceId: id,
              notes: `Rollback Saga: ${reason}`,
            },
          });
        }
      }
    }

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.CANCELLED,
      },
      include: this.defaultInclude(),
    });

    this.metrics.integrationError('saga_compensation');
    this.metrics.workOrderStatusChanged('CANCELLED');

    return updated;
  }

  async finish(id: string) {
    const workOrder = await this.ensureWorkOrderExists(id);

    if (workOrder.status !== WorkOrderStatus.IN_EXECUTION) {
      throw new BadRequestException(
        'Só é possível finalizar uma OS em execução.',
      );
    }

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.FINISHED,
        finishedAt: new Date(),
      },
      include: this.defaultInclude(),
    });

    if (workOrder.executionStartedAt) {
      const segundos =
        (updated.finishedAt!.getTime() -
          workOrder.executionStartedAt.getTime()) /
        1000;
      this.metrics.workOrderStageDuration('execucao', segundos);
    }
    this.metrics.workOrderStatusChanged('FINISHED');

    return updated;
  }

  async deliver(id: string) {
    const workOrder = await this.ensureWorkOrderExists(id);

    if (workOrder.status !== WorkOrderStatus.FINISHED) {
      throw new BadRequestException(
        'Só é possível entregar uma OS finalizada.',
      );
    }

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.DELIVERED,
        deliveredAt: new Date(),
      },
      include: this.defaultInclude(),
    });

    if (workOrder.finishedAt) {
      const segundos =
        (updated.deliveredAt!.getTime() - workOrder.finishedAt.getTime()) /
        1000;
      this.metrics.workOrderStageDuration('finalizacao', segundos);
    }
    this.metrics.workOrderStatusChanged('DELIVERED');

    return updated;
  }

  private async ensureWorkOrderExists(id: string) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id },
    });

    if (!workOrder) {
      throw new NotFoundException('Ordem de serviço não encontrada.');
    }

    return workOrder;
  }

  private ensureWorkOrderCanBeEdited(status: WorkOrderStatus) {
    if (
      status === WorkOrderStatus.IN_EXECUTION ||
      status === WorkOrderStatus.FINISHED ||
      status === WorkOrderStatus.DELIVERED ||
      status === WorkOrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Não é permitido editar itens da OS neste status.',
      );
    }
  }

  private generateWorkOrderCode(): string {
    return `OS-${Date.now()}`;
  }

  private defaultInclude() {
    return {
      customer: {
        select: {
          id: true,
          name: true,
          documentType: true,
          document: true,
        },
      },
      vehicle: {
        select: {
          id: true,
          plate: true,
          brand: true,
          model: true,
          year: true,
        },
      },
      serviceItems: {
        include: {
          service: true,
        },
      },
      partItems: {
        include: {
          inventoryItem: true,
        },
      },
    };
  }

  async getClientTracking(code: string, document: string) {
    const normalizedDocument = onlyDigits(document);

    const workOrder = await this.prisma.workOrder.findFirst({
      where: {
        code,
        customer: {
          document: normalizedDocument,
        },
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
        vehicle: {
          select: {
            id: true,
            plate: true,
            brand: true,
            model: true,
            year: true,
          },
        },
      },
    });

    if (!workOrder) {
      throw new NotFoundException(
        'Ordem de serviço não encontrada para os dados informados.',
      );
    }

    return {
      code: workOrder.code,
      status: workOrder.status,
      customer: {
        name: workOrder.customer.name,
        documentType: workOrder.customer.documentType,
        document: workOrder.customer.document,
      },
      vehicle: {
        plate: workOrder.vehicle.plate,
        brand: workOrder.vehicle.brand,
        model: workOrder.vehicle.model,
        year: workOrder.vehicle.year,
      },
      timeline: {
        openedAt: workOrder.openedAt,
        diagnosisStartedAt: workOrder.diagnosisStartedAt,
        executionStartedAt: workOrder.executionStartedAt,
        finishedAt: workOrder.finishedAt,
        deliveredAt: workOrder.deliveredAt,
      },
      initialNotes: workOrder.initialNotes,
    };
  }
}
