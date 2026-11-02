import { Injectable, NotFoundException } from '@nestjs/common';
import type { IWorkOrderRepository } from '../../domain/repositories/work-order.repository.interface';
import { ApproveBudgetWebhookDto } from '../../dto/approve-budget-webhook.dto';
import type { IEmailService } from '../ports/email.service.interface'; // 👈 Novo Import

@Injectable()
export class ApproveBudgetWebhookUseCase {
  constructor(
    private readonly workOrderRepository: IWorkOrderRepository,
    private readonly emailService: IEmailService, // 👈 Nova Injeção
  ) {}

  async execute(dto: ApproveBudgetWebhookDto) {
    const workOrder = await this.workOrderRepository.findById(dto.workOrderId);
    
    if (!workOrder) {
      throw new NotFoundException('Ordem de serviço não encontrada.');
    }

    const newStatus = dto.approved ? 'IN_EXECUTION' : 'CANCELLED';
    const updatedWorkOrder = await this.workOrderRepository.updateStatus(dto.workOrderId, newStatus);

    // 💡 DISPARO DO E-MAIL
    const customerEmail = (updatedWorkOrder as any).customer?.email || 'cliente@oficina.com';
    await this.emailService.sendStatusUpdateEmail(customerEmail, updatedWorkOrder.code, newStatus);

    return {
      message: dto.approved ? 'Orçamento aprovado com sucesso.' : 'Orçamento rejeitado.',
      workOrder: updatedWorkOrder,
    };
  }
}