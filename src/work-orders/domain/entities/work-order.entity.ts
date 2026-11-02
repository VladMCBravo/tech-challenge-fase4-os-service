// src/work-orders/domain/entities/work-order.entity.ts
import { WorkOrderStatus } from '../../../generated/prisma/client';

export class WorkOrder {
  id?: string;
  code!: string;
  customerId!: string;
  vehicleId!: string;
  initialNotes?: string | null;
  status!: WorkOrderStatus;
}