export enum SagaEventPattern {
  OS_BUDGET_REQUESTED = 'os.budget.requested',
  PAYMENT_APPROVED = 'payment.approved',
  PAYMENT_FAILED = 'payment.failed',
  OS_EXECUTION_REQUESTED = 'os.execution.requested',
  EXECUTION_FINISHED = 'execution.finished',
  EXECUTION_FAILED = 'execution.failed',
}

export interface OsBudgetRequestedPayload {
  event: SagaEventPattern.OS_BUDGET_REQUESTED;
  workOrderId: string;
  workOrderCode: string;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  servicesTotal: number;
  partsTotal: number;
  totalAmount: number;
  timestamp: string;
}

export interface PaymentApprovedPayload {
  event: SagaEventPattern.PAYMENT_APPROVED;
  workOrderId: string;
  budgetId: string;
  paymentId?: string;
  totalAmount: number;
  approvedAt: string;
}

export interface PaymentFailedPayload {
  event: SagaEventPattern.PAYMENT_FAILED;
  workOrderId: string;
  budgetId?: string;
  reason: string;
  failedAt: string;
}

export interface OsExecutionRequestedPayload {
  event: SagaEventPattern.OS_EXECUTION_REQUESTED;
  workOrderId: string;
  workOrderCode: string;
  customerId: string;
  vehicleId: string;
  services: Array<{
    serviceId: string;
    description: string;
    quantity: number;
    estimatedTimeMinutes?: number | null;
  }>;
  parts: Array<{
    inventoryItemId: string;
    plannedQuantity: number;
  }>;
  timestamp: string;
}

export interface ExecutionFinishedPayload {
  event: SagaEventPattern.EXECUTION_FINISHED;
  workOrderId: string;
  executionId: string;
  notes?: string;
  finishedAt: string;
}

export interface ExecutionFailedPayload {
  event: SagaEventPattern.EXECUTION_FAILED;
  workOrderId: string;
  executionId?: string;
  reason: string;
  failedAt: string;
}

export type SagaEventPayload =
  | OsBudgetRequestedPayload
  | PaymentApprovedPayload
  | PaymentFailedPayload
  | OsExecutionRequestedPayload
  | ExecutionFinishedPayload
  | ExecutionFailedPayload;
