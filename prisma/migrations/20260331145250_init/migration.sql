-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CPF', 'CNPJ');

-- CreateEnum
CREATE TYPE "InventoryItemType" AS ENUM ('PART', 'SUPPLY');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('ENTRY', 'DECREASE', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('RECEIVED', 'IN_DIAGNOSIS', 'WAITING_APPROVAL', 'IN_EXECUTION', 'FINISHED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AdminUserRole" AS ENUM ('ADMIN', 'ATTENDANT', 'MECHANIC');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminUserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "document" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "color" TEXT,
    "mileage" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "basePrice" DECIMAL(10,2) NOT NULL,
    "estimatedTimeMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "itemType" "InventoryItemType" NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "quantityAvailable" INTEGER NOT NULL DEFAULT 0,
    "minimumQuantity" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "movementType" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "initialNotes" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diagnosisStartedAt" TIMESTAMP(3),
    "executionStartedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_service_items" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "description" TEXT,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "estimatedTimeMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_service_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_part_items" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "itemType" "InventoryItemType" NOT NULL,
    "plannedQuantity" INTEGER NOT NULL,
    "consumedQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_part_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "servicesTotal" DECIMAL(10,2) NOT NULL,
    "partsTotal" DECIMAL(10,2) NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'PENDING',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_document_key" ON "customers"("document");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_key" ON "vehicles"("plate");

-- CreateIndex
CREATE INDEX "vehicles_customerId_idx" ON "vehicles"("customerId");

-- CreateIndex
CREATE INDEX "services_name_idx" ON "services"("name");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_code_key" ON "inventory_items"("code");

-- CreateIndex
CREATE INDEX "inventory_items_itemType_idx" ON "inventory_items"("itemType");

-- CreateIndex
CREATE INDEX "inventory_items_isActive_idx" ON "inventory_items"("isActive");

-- CreateIndex
CREATE INDEX "inventory_movements_inventoryItemId_idx" ON "inventory_movements"("inventoryItemId");

-- CreateIndex
CREATE INDEX "inventory_movements_movementType_idx" ON "inventory_movements"("movementType");

-- CreateIndex
CREATE INDEX "inventory_movements_referenceType_referenceId_idx" ON "inventory_movements"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_code_key" ON "work_orders"("code");

-- CreateIndex
CREATE INDEX "work_orders_customerId_idx" ON "work_orders"("customerId");

-- CreateIndex
CREATE INDEX "work_orders_vehicleId_idx" ON "work_orders"("vehicleId");

-- CreateIndex
CREATE INDEX "work_orders_status_idx" ON "work_orders"("status");

-- CreateIndex
CREATE INDEX "work_orders_openedAt_idx" ON "work_orders"("openedAt");

-- CreateIndex
CREATE INDEX "work_order_service_items_workOrderId_idx" ON "work_order_service_items"("workOrderId");

-- CreateIndex
CREATE INDEX "work_order_service_items_serviceId_idx" ON "work_order_service_items"("serviceId");

-- CreateIndex
CREATE INDEX "work_order_part_items_workOrderId_idx" ON "work_order_part_items"("workOrderId");

-- CreateIndex
CREATE INDEX "work_order_part_items_inventoryItemId_idx" ON "work_order_part_items"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_workOrderId_key" ON "budgets"("workOrderId");

-- CreateIndex
CREATE INDEX "budgets_status_idx" ON "budgets"("status");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_service_items" ADD CONSTRAINT "work_order_service_items_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_service_items" ADD CONSTRAINT "work_order_service_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_part_items" ADD CONSTRAINT "work_order_part_items_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_part_items" ADD CONSTRAINT "work_order_part_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
