// src/work-orders/infrastructure/email/mock-email.service.ts
import { Injectable, Logger } from '@nestjs/common';
import type { IEmailService } from '../../application/ports/email.service.interface';

@Injectable()
export class MockEmailService implements IEmailService {
  // Utilizamos o Logger nativo do NestJS para ficar com o mesmo formato dos logs da aplicação
  private readonly logger = new Logger(MockEmailService.name);

  async sendStatusUpdateEmail(to: string, workOrderCode: string, newStatus: string): Promise<void> {
    this.logger.log(`\n
      ================================================
      [MOCK E-MAIL] 📧 A Enviar e-mail para: ${to}
      [MOCK E-MAIL] 📋 Assunto: Atualização da Ordem de Serviço ${workOrderCode}
      [MOCK E-MAIL] 📝 Corpo: Olá! O status da sua ordem de serviço mudou para: ${newStatus}
      ================================================
    `);
  }
}