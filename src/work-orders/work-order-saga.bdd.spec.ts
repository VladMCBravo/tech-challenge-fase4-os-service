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

import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { defineFeature, DefineStepFunction, loadFeature } from 'jest-cucumber';
import { WorkOrdersService } from './work-orders.service';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MetricsService } from '../observability/metrics.service';
import { RabbitMQService } from '../messaging/rabbitmq.service';

/**
 * BDD executável: cada passo do arquivo Gherkin abaixo é ligado a uma step
 * definition via jest-cucumber. Se um passo do .feature mudar ou não tiver
 * implementação correspondente, o teste falha.
 */
const feature = loadFeature(
  path.join(__dirname, 'features', 'work-order-saga.feature'),
);

type DbState = {
  customers: Record<string, any>;
  vehicles: Record<string, any>;
  services: Record<string, any>;
  inventory: Record<string, any>;
  movements: any[];
  workOrders: Record<string, any>;
  serviceItems: any[];
  partItems: any[];
};

defineFeature(feature, (test) => {
  let service: WorkOrdersService;
  let rabbitMQ: RabbitMQService;
  let dbState: DbState;
  let workOrderId: string;

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

    // Estado in-memory que simula o banco relacional (os_db) durante os cenários
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
          const wo = { id: 'wo-bdd-1', ...data, openedAt: new Date() };
          dbState.workOrders[wo.id] = wo;
          return wo;
        }),
        findUnique: jest.fn(async ({ where }) => dbState.workOrders[where.id] ?? null),
        update: jest.fn(async ({ where, data }) => {
          const wo = dbState.workOrders[where.id];
          Object.assign(wo, data);
          return {
            ...wo,
            serviceItems: dbState.serviceItems.filter((s) => s.workOrderId === where.id),
            partItems: dbState.partItems.filter((p) => p.workOrderId === where.id),
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
            .map((p) => ({ ...p, inventoryItem: dbState.inventory[p.inventoryItemId] })),
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

  // ---------------------------------------------------------------------------
  // Passos compartilhados entre os cenários
  // ---------------------------------------------------------------------------
  const clienteComVeiculoEPeca = (given: DefineStepFunction) => {
    given(
      /^um cliente ativo "(.*)" com um veículo "(.*)" e uma peça "(.*)" com (\d+) unidades em estoque$/,
      (customerId: string, vehicleId: string, partId: string, quantity: string) => {
        dbState.customers[customerId] = { id: customerId, name: 'Carlos Silva', isActive: true };
        dbState.vehicles[vehicleId] = { id: vehicleId, customerId, plate: 'ABC1D23' };
        dbState.inventory[partId] = {
          id: partId,
          name: partId,
          itemType: 'PART',
          unitPrice: 120,
          quantityAvailable: Number(quantity),
          isActive: true,
        };
      },
    );
  };

  const statusDaOs = (step: DefineStepFunction) => {
    step(/^a Ordem de Serviço deve mudar para o status "(.*)"$/, (status: string) => {
      expect(dbState.workOrders[workOrderId].status).toBe(status);
    });
  };

  const abrirOsEIniciarDiagnostico = async () => {
    const created = await service.create({
      customerId: 'cliente-01',
      vehicleId: 'veiculo-01',
      initialNotes: 'Revisão periódica',
    });
    expect(created.status).toBe('RECEIVED');
    workOrderId = created.id;
    await service.startDiagnosis(workOrderId);
    expect(dbState.workOrders[workOrderId].status).toBe('IN_DIAGNOSIS');
  };

  const publishedPatterns = () => rabbitMQ.getPublishedEvents().map((e) => e.pattern);

  // ---------------------------------------------------------------------------
  // Cenário 1
  // ---------------------------------------------------------------------------
  test('Fluxo completo de sucesso de uma Ordem de Serviço pela Saga', ({
    given,
    when,
    then,
    and,
  }) => {
    clienteComVeiculoEPeca(given);

    when('o atendente abre uma nova Ordem de Serviço e inicia o diagnóstico', async () => {
      await abrirOsEIniciarDiagnostico();
    });

    and(
      /^adiciona o serviço "(.*)" no valor de (\d+) e (\d+) unidades da peça "(.*)" no valor unitário de (\d+)$/,
      async (serviceId: string, price: string, quantity: string, partId: string, unitPrice: string) => {
        dbState.services[serviceId] = {
          id: serviceId,
          name: serviceId,
          basePrice: Number(price),
          estimatedTimeMinutes: 45,
          isActive: true,
        };
        dbState.inventory[partId].unitPrice = Number(unitPrice);
        await service.addServiceItem(workOrderId, { serviceId, quantity: 1 });
        await service.addPartItem(workOrderId, {
          inventoryItemId: partId,
          plannedQuantity: Number(quantity),
        });
      },
    );

    and('move a Ordem de Serviço para aguardando aprovação disparando a Saga', async () => {
      await service.moveToAwaitingApproval(workOrderId);
    });

    then(
      /^o estoque da peça "(.*)" deve ser reservado restando (\d+) unidades$/,
      (partId: string, remaining: string) => {
        expect(dbState.inventory[partId].quantityAvailable).toBe(Number(remaining));
      },
    );

    and(
      /^o evento "(.*)" deve ser publicado com valor total de (\d+)$/,
      (pattern: string, total: string) => {
        const event = rabbitMQ.getPublishedEvents().find((e) => e.pattern === pattern);
        expect(event).toBeDefined();
        expect(event?.payload.totalAmount).toBe(Number(total));
      },
    );

    when(/^o evento "(.*)" é recebido do microsserviço de Billing$/, async (pattern: string) => {
      await rabbitMQ.dispatchEvent(pattern, {
        event: pattern,
        workOrderId,
        budgetId: 'budget-01',
        paymentId: 'mp-999',
        totalAmount: 250,
        approvedAt: new Date().toISOString(),
      });
    });

    statusDaOs(then);

    and(/^o evento "(.*)" deve ser publicado para o microsserviço de Execução$/, (pattern: string) => {
      expect(publishedPatterns()).toContain(pattern);
    });

    when(
      /^o evento "(.*)" é recebido do microsserviço de Execução e o veículo é entregue$/,
      async (pattern: string) => {
        await rabbitMQ.dispatchEvent(pattern, {
          event: pattern,
          workOrderId,
          executionId: 'exec-01',
          finishedAt: new Date().toISOString(),
        });
        expect(dbState.workOrders[workOrderId].status).toBe('FINISHED');
        await service.deliver(workOrderId);
      },
    );

    then(/^a Ordem de Serviço deve alcançar o status final "(.*)"$/, (status: string) => {
      expect(dbState.workOrders[workOrderId].status).toBe(status);
    });
  });

  // ---------------------------------------------------------------------------
  // Cenário 2
  // ---------------------------------------------------------------------------
  test('Compensação e Rollback da Saga quando o pagamento é recusado', ({
    given,
    when,
    then,
    and,
  }) => {
    clienteComVeiculoEPeca(given);

    when(
      /^o atendente abre uma OS, inicia o diagnóstico, adiciona (\d+) unidades da peça "(.*)" e solicita aprovação$/,
      async (quantity: string, partId: string) => {
        await abrirOsEIniciarDiagnostico();
        await service.addPartItem(workOrderId, {
          inventoryItemId: partId,
          plannedQuantity: Number(quantity),
        });
        await service.moveToAwaitingApproval(workOrderId);
      },
    );

    then(
      /^o estoque da peça "(.*)" cai para (\d+) unidades e a OS fica em "(.*)"$/,
      (partId: string, remaining: string, status: string) => {
        expect(dbState.inventory[partId].quantityAvailable).toBe(Number(remaining));
        expect(dbState.workOrders[workOrderId].status).toBe(status);
      },
    );

    when(/^o evento "(.*)" é recebido por recusa no Mercado Pago$/, async (pattern: string) => {
      await rabbitMQ.dispatchEvent(pattern, {
        event: pattern,
        workOrderId,
        reason: 'Cartão recusado no Mercado Pago',
        failedAt: new Date().toISOString(),
      });
    });

    then(
      /^a transação compensatória deve estornar (\d+) unidades para a peça "(.*)" restaurando o estoque para (\d+)$/,
      (quantity: string, partId: string, restored: string) => {
        expect(dbState.inventory[partId].quantityAvailable).toBe(Number(restored));
        const reversal = dbState.movements.find(
          (m) => m.movementType === 'REVERSAL' && m.inventoryItemId === partId,
        );
        expect(reversal?.quantity).toBe(Number(quantity));
      },
    );

    and(/^um movimento de estoque do tipo "(.*)" deve ser registrado$/, (type: string) => {
      expect(dbState.movements.some((m) => m.movementType === type)).toBe(true);
    });

    statusDaOs(and);
  });
});
