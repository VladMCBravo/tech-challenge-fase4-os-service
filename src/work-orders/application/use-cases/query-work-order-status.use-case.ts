// src/work-orders/application/use-cases/query-work-order-status.use-case.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { IWorkOrderRepository } from '../../domain/repositories/work-order.repository.interface';

@Injectable()
export class QueryWorkOrderStatusUseCase {
  constructor(private readonly workOrderRepository: IWorkOrderRepository) {}

  async execute(code: string, document: string) {
    // 1. Validamos se os dados foram enviados
    if (!code || !document) {
      throw new NotFoundException('Código e documento são obrigatórios.');
    }

    // 2. Buscamos no banco através da porta (Interface)
    const tracking = await this.workOrderRepository.findTracking(code, document);

    if (!tracking) {
      throw new NotFoundException('Ordem de serviço não encontrada para os dados informados.');
    }

    return tracking;
  }
}