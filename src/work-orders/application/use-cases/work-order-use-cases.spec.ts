jest.mock('../../../shared/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateWorkOrderUseCase } from './create-work-order.use-case';
import { ListWorkOrdersUseCase } from './list-work-orders.use-case';
import { QueryWorkOrderStatusUseCase } from './query-work-order-status.use-case';
import { ApproveBudgetWebhookUseCase } from './approve-budget-webhook.use-case';
import { PrismaWorkOrderRepository } from '../../infrastructure/database/prisma/prisma-work-order.repository';
import { MockEmailService } from '../../infrastructure/email/mock-email.service';
import { RabbitMQService } from '../../../messaging/rabbitmq.service';
import { MetricsService } from '../../../observability/metrics.service';

describe('WorkOrder UseCases, Repository, Messaging & Observability', () => {
  describe('CreateWorkOrderUseCase', () => {
    const workOrderRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findTracking: jest.fn(),
      listActiveWithPriority: jest.fn(),
      updateStatus: jest.fn(),
    };
    const customerRepo = { findById: jest.fn() };
    const vehicleRepo = { findById: jest.fn() };

    const useCase = new CreateWorkOrderUseCase(
      workOrderRepo as any,
      customerRepo as any,
      vehicleRepo as any,
    );

    beforeEach(() => jest.clearAllMocks());

    it('deve criar OS via UseCase com sucesso', async () => {
      customerRepo.findById.mockResolvedValue({ id: 'c1' });
      vehicleRepo.findById.mockResolvedValue({ id: 'v1', customerId: 'c1' });
      workOrderRepo.create.mockImplementation(async (wo) => ({ id: 'wo-1', ...wo }));

      const res = await useCase.execute({
        customerId: 'c1',
        vehicleId: 'v1',
        initialNotes: ' Barulho ',
      });

      expect(res.status).toBe('RECEIVED');
      expect(workOrderRepo.create).toHaveBeenCalled();
    });

    it('deve falhar se cliente não existe', async () => {
      customerRepo.findById.mockResolvedValue(null);
      await expect(
        useCase.execute({ customerId: 'c1', vehicleId: 'v1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deve falhar se veículo não existe ou não pertence ao cliente', async () => {
      customerRepo.findById.mockResolvedValue({ id: 'c1' });
      vehicleRepo.findById.mockResolvedValue(null);
      await expect(
        useCase.execute({ customerId: 'c1', vehicleId: 'v1' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      vehicleRepo.findById.mockResolvedValue({ id: 'v1', customerId: 'other' });
      await expect(
        useCase.execute({ customerId: 'c1', vehicleId: 'v1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('ListWorkOrdersUseCase & QueryWorkOrderStatusUseCase', () => {
    const repo = {
      listActiveWithPriority: jest.fn().mockResolvedValue([{ id: 'wo-1' }]),
      findTracking: jest.fn(),
    };

    it('deve listar OS ativas ordenadas por prioridade', async () => {
      const listUC = new ListWorkOrdersUseCase(repo as any);
      const result = await listUC.execute();
      expect(result).toHaveLength(1);
    });

    it('deve consultar status por código e documento e validar erros', async () => {
      const queryUC = new QueryWorkOrderStatusUseCase(repo as any);
      await expect(queryUC.execute('', '')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      repo.findTracking.mockResolvedValue(null);
      await expect(
        queryUC.execute('OS-1', '12345678909'),
      ).rejects.toBeInstanceOf(NotFoundException);

      repo.findTracking.mockResolvedValue({ code: 'OS-1', status: 'RECEIVED' });
      const found = await queryUC.execute('OS-1', '12345678909');
      expect(found.code).toBe('OS-1');
    });
  });

  describe('ApproveBudgetWebhookUseCase & MockEmailService', () => {
    it('deve aprovar ou rejeitar orçamento via webhook e enviar email', async () => {
      const repo = {
        findById: jest.fn(),
        updateStatus: jest.fn(),
      };
      const emailService = new MockEmailService();
      const useCase = new ApproveBudgetWebhookUseCase(repo as any, emailService);

      repo.findById.mockResolvedValue(null);
      await expect(
        useCase.execute({ workOrderId: 'wo-1', approved: true }),
      ).rejects.toBeInstanceOf(NotFoundException);

      repo.findById.mockResolvedValue({ id: 'wo-1', code: 'OS-1' });
      repo.updateStatus.mockResolvedValue({
        id: 'wo-1',
        code: 'OS-1',
        status: 'IN_EXECUTION',
        customer: { email: 'cliente@teste.com' },
      });

      const approved = await useCase.execute({
        workOrderId: 'wo-1',
        approved: true,
      });
      expect(approved.message).toContain('aprovado');

      repo.updateStatus.mockResolvedValue({
        id: 'wo-1',
        code: 'OS-1',
        status: 'CANCELLED',
      });
      const rejected = await useCase.execute({
        workOrderId: 'wo-1',
        approved: false,
      });
      expect(rejected.message).toContain('rejeitado');
    });
  });

  describe('PrismaWorkOrderRepository', () => {
    const prismaMock = {
      workOrder: {
        create: jest.fn().mockResolvedValue({ id: 'wo-1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'wo-1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'wo-1' }),
        findMany: jest.fn().mockResolvedValue([
          { id: '1', status: 'RECEIVED' },
          { id: '2', status: 'IN_EXECUTION' },
          { id: '3', status: 'WAITING_APPROVAL' },
        ]),
        update: jest.fn().mockResolvedValue({ id: 'wo-1', status: 'FINISHED' }),
      },
    };

    it('deve executar métodos do repositório Prisma e ordenar fila por prioridade', async () => {
      const repository = new PrismaWorkOrderRepository(prismaMock as any);
      await repository.create({
        code: 'OS-1',
        customerId: 'c1',
        vehicleId: 'v1',
        status: 'RECEIVED',
      } as any);
      await repository.findById('wo-1');
      await repository.findTracking('OS-1', '123.456.789-01');
      const ordered = await repository.listActiveWithPriority();
      expect(ordered[0].status).toBe('IN_EXECUTION');
      expect(ordered[1].status).toBe('WAITING_APPROVAL');
      expect(ordered[2].status).toBe('RECEIVED');
      await repository.updateStatus('wo-1', 'FINISHED');
    });
  });

  describe('RabbitMQService & MetricsService', () => {
    it('deve publicar, limpar e despachar eventos em modo local no RabbitMQService', async () => {
      const rmq = new RabbitMQService();
      await rmq.onModuleInit();
      const handler = jest.fn();
      rmq.registerHandler('test.event', handler);
      await rmq.publish('test.event', { workOrderId: 'wo-1' });
      expect(rmq.getPublishedEvents()).toHaveLength(1);
      await rmq.dispatchEvent('test.event', { workOrderId: 'wo-1' });
      expect(handler).toHaveBeenCalledWith({ workOrderId: 'wo-1' });
      rmq.clearPublishedEvents();
      expect(rmq.getPublishedEvents()).toHaveLength(0);
      await rmq.onModuleDestroy();
    });

    it('deve registrar métricas no MetricsService sem lançar erro', () => {
      const metrics = new MetricsService();
      metrics.workOrderCreated();
      metrics.workOrderStatusChanged('RECEIVED');
      metrics.workOrderStageDuration('diagnostico', 12.5);
      metrics.integrationError('test_error');
      metrics.gauge('oficina.queue.size', 3);
      expect(metrics).toBeDefined();
    });
  });
});
