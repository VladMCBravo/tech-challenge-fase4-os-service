// src/work-orders/application/ports/email.service.interface.ts
export interface IEmailService {
  sendStatusUpdateEmail(to: string, workOrderCode: string, newStatus: string): Promise<void>;
}