// src/work-orders/application/use-cases/list-work-orders.use-case.ts
import { Injectable } from '@nestjs/common';
import type { IWorkOrderRepository } from '../../domain/repositories/work-order.repository.interface';

@Injectable()
export class ListWorkOrdersUseCase {
  constructor(private readonly workOrderRepository: IWorkOrderRepository) {}

  async execute() {
    // Toda a responsabilidade de ordenar e filtrar OS ativas
    // foi delegada para o banco de dados (Prisma) por questões de performance.
    return this.workOrderRepository.listActiveWithPriority();
  }
}