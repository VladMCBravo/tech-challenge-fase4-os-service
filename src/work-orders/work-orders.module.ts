// src/work-orders/work-orders.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { PrismaService } from '../shared/prisma/prisma.service'; // 👈 Novo Import Necessário
import { ClientWorkOrdersController } from './client-work-orders.controller';
import { WorkOrdersController } from './work-orders.controller';
import { PrismaWorkOrderRepository } from './infrastructure/database/prisma/prisma-work-order.repository';

// 1. Importamos todos os Casos de Uso
import { CreateWorkOrderUseCase } from './application/use-cases/create-work-order.use-case';
import { QueryWorkOrderStatusUseCase } from './application/use-cases/query-work-order-status.use-case';
import { ListWorkOrdersUseCase } from './application/use-cases/list-work-orders.use-case';
import { ApproveBudgetWebhookUseCase } from './application/use-cases/approve-budget-webhook.use-case';
import { MockEmailService } from './infrastructure/email/mock-email.service';

// 2. Importamos o Service antigo
import { WorkOrdersService } from './work-orders.service';

@Module({
  imports: [PrismaModule],
  controllers: [WorkOrdersController, ClientWorkOrdersController],
  providers: [
    WorkOrdersService,
    PrismaWorkOrderRepository,
    MockEmailService,
    
    {
      provide: 'IWorkOrderRepository', 
      useClass: PrismaWorkOrderRepository,
    },
    
    // --- REGISTRO DOS USE CASES ---
    
    {
      provide: CreateWorkOrderUseCase,
      useFactory: (
        workOrderRepo: PrismaWorkOrderRepository,
        prisma: PrismaService // 👈 Injetamos o PrismaService aqui
      ) => {
        // Criamos repositórios "falsos" (mock) inline que fazem a busca real no banco
        // para não quebrar a sua regra de negócio!
        const customerRepo = {
          findById: async (id: string) => prisma.customer.findUnique({ where: { id } })
        };
        const vehicleRepo = {
          findById: async (id: string) => prisma.vehicle.findUnique({ where: { id } })
        };

        // Passamos os 3 argumentos exigidos pelo seu construtor
        return new CreateWorkOrderUseCase(
          workOrderRepo, 
          customerRepo as any, 
          vehicleRepo as any
        );
      },
      inject: [PrismaWorkOrderRepository, PrismaService], // 👈 Declaramos a injeção do PrismaService aqui também
    },

    {
      provide: QueryWorkOrderStatusUseCase,
      useFactory: (workOrderRepo: PrismaWorkOrderRepository) => {
        return new QueryWorkOrderStatusUseCase(workOrderRepo);
      },
      inject: [PrismaWorkOrderRepository],
    },

    {
      provide: ListWorkOrdersUseCase,
      useFactory: (workOrderRepo: PrismaWorkOrderRepository) => {
        return new ListWorkOrdersUseCase(workOrderRepo);
      },
      inject: [PrismaWorkOrderRepository],
    },

    {
      provide: ApproveBudgetWebhookUseCase,
      useFactory: (
        workOrderRepo: PrismaWorkOrderRepository,
        emailService: MockEmailService // 👈 Adicionamos aqui
      ) => {
        // Passamos o emailService como segundo argumento para o Use Case
        return new ApproveBudgetWebhookUseCase(workOrderRepo, emailService); 
      },
      // Precisamos de avisar o NestJS para injetar também o MockEmailService
      inject: [PrismaWorkOrderRepository, MockEmailService], 
    }
  ],
  
  exports: [
    CreateWorkOrderUseCase,
    QueryWorkOrderStatusUseCase,
    ListWorkOrdersUseCase,
    ApproveBudgetWebhookUseCase,
    WorkOrdersService
  ],
})
export class WorkOrdersModule {}