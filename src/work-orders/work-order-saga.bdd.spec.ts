jest.mock('../shared/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () => ({
  WorkOrderStatus: {
    RECEIVED: 'RECEIVED',
    IN_DIAGNOSIS: 'IN_DIAGNOSIS',
    WAITING_APPROVAL: 'WAITING_APPROVAL',
    IN_EXECUTION: 'IN_EXECUTION',
    FINISHED: 'FINISHED',
    DELIVERED: 'DELIVERED',
    CANCELLED: 'CANCELLED',
  },
  InventoryMovementType: {
    ENTRY: 'ENTRY',
    DECREASE: 'DECREASE',
    ADJUSTMENT: 'ADJUSTMENT',
    REVERSAL: 'REVERSAL',
  },
}));

jest.mock('../observability/metrics.service', () => ({
  MetricsService: class MetricsService {},
}));

import * as fs from 'fs';
import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { WorkOrdersService } from './work-orders.service';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MetricsService } from '../observability/metrics.service';
import { RabbitMQService } from '../messaging/rabbitmq.service';
import { SagaEventPattern } from '../messaging/saga-events.interface';

describe('BDD - Fluxo Transacional de Ordem de Serviço com Saga Pattern (.feature)', () => {
  const featurePath = path.join(
    __dirname,
    'features',
    'work-order-saga.feature',
  );
  const featureContent = fs.readFileSync(featurePath, 'utf-8');

  let service: WorkOrdersService;
  let rabbitMQ: RabbitMQService;

  // Estado in-memory simulando o banco relacional durante os cenários BDD
  let dbState: {
    customers: Record<string, any>;
    vehicles: Record<string, any>;
    services: Record<string, any>;
    inventory: Record<string, any>;
    movements: any[];
    workOrders: Record<string, any>;
    serviceItems: any[];
    partItems: any[];
  };

  const metricsMock = {
    workOrderCreated: jest.fn(),
    workOrderStatusChanged: jest.fn(),
    workOrderStageDuration: jest.fn(),
    integrationError: jest.fn(),
    increment: jest.fn(),
    gauge: jest.fn(),
    distribution: jest.fn(),
  };

  beforeEach(async () => {
    dbState = {
      customers: {},
      vehicles: {},
      services: {},
      inventory: {},
      movements: [],
      workOrders: {},
      serviceItems: [],
      partItems: [],
    };

    const prismaStatefulMock = {
      customer: {
        findUnique: jest.fn(async ({ where }) => dbState.customers[where.id] ?? null),
      },
      vehicle: {
        findUnique: jest.fn(async ({ where }) => dbState.vehicles[where.id] ?? null),
      },
      service: {
        findUnique: jest.fn(async ({ where }) => dbState.services[where.id] ?? null),
      },
      inventoryItem: {
        findUnique: jest.fn(async ({ where }) => dbState.inventory[where.id] ?? null),
        update: jest.fn(async ({ where, data }) => {
          dbState.inventory[where.id].quantityAvailable = data.quantityAvailable;
          return dbState.inventory[where.id];
        }),
      },
      inventoryMovement: {
        create: jest.fn(async ({ data }) => {
          dbState.movements.push(data);
          return data;
        }),
      },
      workOrder: {
        create: jest.fn(async ({ data }) => {
          const wo = {
            id: 'wo-bdd-1',
            ...data,
            openedAt: new Date(),
          };
          dbState.workOrders[wo.id] = wo;
          return wo;
        }),
        findUnique: jest.fn(async ({ where }) => dbState.workOrders[where.id] ?? null),
        update: jest.fn(async ({ where, data }) => {
          const wo = dbState.workOrders[where.id];
          Object.assign(wo, data);
          return {
            ...wo,
            serviceItems: dbState.serviceItems.filter(
              (s) => s.workOrderId === where.id,
            ),
            partItems: dbState.partItems.filter(
              (p) => p.workOrderId === where.id,
            ),
          };
        }),
      },
      workOrderServiceItem: {
        create: jest.fn(async ({ data }) => {
          const item = { id: `si-${dbState.serviceItems.length + 1}`, ...data };
          dbState.serviceItems.push(item);
          return item;
        }),
        findMany: jest.fn(async ({ where }) =>
          dbState.serviceItems.filter((s) => s.workOrderId === where.workOrderId),
        ),
      },
      workOrderPartItem: {
        create: jest.fn(async ({ data }) => {
          const item = { id: `pi-${dbState.partItems.length + 1}`, ...data };
          dbState.partItems.push(item);
          return item;
        }),
        findMany: jest.fn(async ({ where }) =>
          dbState.partItems
            .filter((p) => p.workOrderId === where.workOrderId)
            .map((p) => ({
              ...p,
              inventoryItem: dbState.inventory[p.inventoryItemId],
            })),
        ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        RabbitMQService,
        { provide: PrismaService, useValue: prismaStatefulMock },
        { provide: MetricsService, useValue: metricsMock },
      ],
    }).compile();

    service = module.get<WorkOrdersService>(WorkOrdersService);
    rabbitMQ = module.get<RabbitMQService>(RabbitMQService);
    service.onModuleInit();
  });

  it('deve validar que o arquivo Gherkin .feature contém os cenários obrigatórios de BDD', () => {
    expect(featureContent).toContain(
      'Funcionalidade: Fluxo Transacional de Ordem de Serviço com Saga Pattern',
    );
    expect(featureContent).toContain(
      'Cenário: Fluxo completo de sucesso de uma Ordem de Serviço pela Saga',
    );
    expect(featureContent).toContain(
      'Cenário: Compensação e Rollback da Saga quando o pagamento é recusado',
    );
  });

  it('Cenário BDD 1: Fluxo completo de sucesso de uma Ordem de Serviço pela Saga', async () => {
    // Dado um cliente ativo "cliente-01" com um veículo "veiculo-01" e uma peça "peca-filtro" com 10 unidades em estoque
    dbState.customers['cliente-01'] = { id: 'cliente-01', name: 'Carlos Silva', isActive: true };
    dbState.vehicles['veiculo-01'] = { id: 'veiculo-01', customerId: 'cliente-01', plate: 'ABC1D23' };
    dbState.services['srv-troca-oleo'] = {
      id: 'srv-troca-oleo',
      name: 'Troca de Óleo',
      basePrice: 150,
      estimatedTimeMinutes: 45,
      isActive: true,
    };
    dbState.inventory['peca-filtro'] = {
      id: 'peca-filtro',
      name: 'Filtro de Óleo',
      itemType: 'PART',
      unitPrice: 50,
      quantityAvailable: 10,
      isActive: true,
    };

    // Quando o atendente abre uma nova Ordem de Serviço e inicia o diagnóstico
    const createdOs = await service.create({
      customerId: 'cliente-01',
      vehicleId: 'veiculo-01',
      initialNotes: 'Revisão periódica',
    });
    expect(createdOs.status).toBe('RECEIVED');

    await service.startDiagnosis(createdOs.id);
    expect(dbState.workOrders[createdOs.id].status).toBe('IN_DIAGNOSIS');

    // E adiciona o serviço "srv-troca-oleo" no valor de 150 e 2 unidades da peça "peca-filtro" no valor unitário de 50
    await service.addServiceItem(createdOs.id, {
      serviceId: 'srv-troca-oleo',
      quantity: 1,
    });
    await service.addPartItem(createdOs.id, {
      inventoryItemId: 'peca-filtro',
      plannedQuantity: 2,
    });

    // E move a Ordem de Serviço para aguardando aprovação disparando a Saga
    await service.moveToAwaitingApproval(createdOs.id);

    // Então o estoque da peça "peca-filtro" deve ser reservado restando 8 unidades
    expect(dbState.inventory['peca-filtro'].quantityAvailable).toBe(8);

    // E o evento "os.budget.requested" deve ser publicado com valor total de 250
    const eventsAfterBudgetReq = rabbitMQ.getPublishedEvents();
    expect(eventsAfterBudgetReq).toHaveLength(1);
    expect(eventsAfterBudgetReq[0].pattern).toBe(
      SagaEventPattern.OS_BUDGET_REQUESTED,
    );
    expect(eventsAfterBudgetReq[0].payload.totalAmount).toBe(250);

    // Quando o evento "payment.approved" é recebido do microsserviço de Billing
    await rabbitMQ.dispatchEvent(SagaEventPattern.PAYMENT_APPROVED, {
      event: SagaEventPattern.PAYMENT_APPROVED,
      workOrderId: createdOs.id,
      budgetId: 'budget-01',
      paymentId: 'mp-999',
      totalAmount: 250,
      approvedAt: new Date().toISOString(),
    });

    // Então a Ordem de Serviço deve mudar para o status "IN_EXECUTION"
    expect(dbState.workOrders[createdOs.id].status).toBe('IN_EXECUTION');

    // E o evento "os.execution.requested" deve ser publicado para o microsserviço de Execução
    const eventsAfterApproval = rabbitMQ.getPublishedEvents();
    expect(eventsAfterApproval).toHaveLength(2);
    expect(eventsAfterApproval[1].pattern).toBe(
      SagaEventPattern.OS_EXECUTION_REQUESTED,
    );

    // Quando o evento "execution.finished" é recebido do microsserviço de Execução e o veículo é entregue
    await rabbitMQ.dispatchEvent(SagaEventPattern.EXECUTION_FINISHED, {
      event: SagaEventPattern.EXECUTION_FINISHED,
      workOrderId: createdOs.id,
      executionId: 'exec-01',
      finishedAt: new Date().toISOString(),
    });
    expect(dbState.workOrders[createdOs.id].status).toBe('FINISHED');

    const deliveredOs = await service.deliver(createdOs.id);

    // Então a Ordem de Serviço deve alcançar o status final "DELIVERED"
    expect(deliveredOs.status).toBe('DELIVERED');
  });

  it('Cenário BDD 2: Compensação e Rollback da Saga quando o pagamento é recusado', async () => {
    // Dado um cliente ativo "cliente-01" com um veículo "veiculo-01" e uma peça "peca-pastilha" com 5 unidades em estoque
    dbState.customers['cliente-01'] = { id: 'cliente-01', name: 'Carlos Silva', isActive: true };
    dbState.vehicles['veiculo-01'] = { id: 'veiculo-01', customerId: 'cliente-01', plate: 'ABC1D23' };
    dbState.inventory['peca-pastilha'] = {
      id: 'peca-pastilha',
      name: 'Jogo de Pastilhas',
      itemType: 'PART',
      unitPrice: 120,
      quantityAvailable: 5,
      isActive: true,
    };

    // Quando o atendente abre uma OS, inicia o diagnóstico, adiciona 2 unidades da peça "peca-pastilha" e solicita aprovação
    const os = await service.create({
      customerId: 'cliente-01',
      vehicleId: 'veiculo-01',
    });
    await service.startDiagnosis(os.id);
    await service.addPartItem(os.id, {
      inventoryItemId: 'peca-pastilha',
      plannedQuantity: 2,
    });
    await service.moveToAwaitingApproval(os.id);

    // Então o estoque da peça "peca-pastilha" cai para 3 unidades e a OS fica em "WAITING_APPROVAL"
    expect(dbState.inventory['peca-pastilha'].quantityAvailable).toBe(3);
    expect(dbState.workOrders[os.id].status).toBe('WAITING_APPROVAL');

    // Quando o evento "payment.failed" é recebido por recusa no Mercado Pago
    await rabbitMQ.dispatchEvent(SagaEventPattern.PAYMENT_FAILED, {
      event: SagaEventPattern.PAYMENT_FAILED,
      workOrderId: os.id,
      reason: 'Cartão recusado no Mercado Pago',
      failedAt: new Date().toISOString(),
    });

    // Então a transação compensatória deve estornar 2 unidades para a peça "peca-pastilha" restaurando o estoque para 5
    expect(dbState.inventory['peca-pastilha'].quantityAvailable).toBe(5);

    // E um movimento de estoque do tipo "REVERSAL" deve ser registrado
    const reversalMovement = dbState.movements.find(
      (m) => m.movementType === 'REVERSAL',
    );
    expect(reversalMovement).toBeDefined();
    expect(reversalMovement.quantity).toBe(2);

    // E a Ordem de Serviço deve mudar para o status "CANCELLED"
    expect(dbState.workOrders[os.id].status).toBe('CANCELLED');
  });
});
