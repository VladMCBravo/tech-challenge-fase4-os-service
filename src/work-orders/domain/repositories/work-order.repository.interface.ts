// src/work-orders/domain/repositories/work-order.repository.interface.ts
import type { WorkOrder } from '../entities/work-order.entity';

export interface IWorkOrderRepository {
  create(workOrder: WorkOrder): Promise<WorkOrder>;
  findById(id: string): Promise<WorkOrder | null>;
  
  // 👇 Novos métodos para as APIs 2 e 3
  findTracking(code: string, document: string): Promise<any | null>;
  listActiveWithPriority(): Promise<WorkOrder[]>;
  updateStatus(id: string, status: string): Promise<WorkOrder>;
}