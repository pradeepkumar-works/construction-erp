-- Machinery maintenance and vehicle documents (roadmap v4 item 42): maintenance job cards with spares issued from stock,
-- service intervals on equipment, insurance / fitness / permit / PUC register, drivers. Additive only.

-- CreateEnum
CREATE TYPE "MaintenanceKind" AS ENUM ('SERVICE', 'BREAKDOWN');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "EquipmentDocType" AS ENUM ('INSURANCE', 'FITNESS', 'PERMIT', 'PUC', 'ROAD_TAX', 'REGISTRATION', 'OTHER');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MACHINERY';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "equipmentDocId" TEXT,
ADD COLUMN     "maintenanceJobId" TEXT;

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "lastServiceDate" DATE,
ADD COLUMN     "lastServiceMeter" DECIMAL(18,2),
ADD COLUMN     "serviceIntervalDays" INTEGER,
ADD COLUMN     "serviceIntervalHours" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "StockEntry" ADD COLUMN     "maintenanceJobId" TEXT;

-- CreateTable
CREATE TABLE "MaintenanceJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "projectId" TEXT,
    "jobNo" TEXT NOT NULL,
    "kind" "MaintenanceKind" NOT NULL,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
    "date" DATE NOT NULL,
    "meterReading" DECIMAL(18,2),
    "description" TEXT NOT NULL,
    "workshop" TEXT,
    "workDone" TEXT,
    "closedDate" DATE,
    "downtimeHours" DECIMAL(18,2),
    "labourCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "partsCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reportedById" TEXT NOT NULL,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "type" "EquipmentDocType" NOT NULL,
    "number" TEXT,
    "issuer" TEXT,
    "validFrom" DATE,
    "validTo" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "licenceNo" TEXT,
    "licenceClass" TEXT,
    "licenceValidTo" DATE,
    "equipmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceJob_organizationId_status_idx" ON "MaintenanceJob"("organizationId", "status");

-- CreateIndex
CREATE INDEX "MaintenanceJob_equipmentId_date_idx" ON "MaintenanceJob"("equipmentId", "date");

-- CreateIndex
CREATE INDEX "MaintenanceJob_projectId_idx" ON "MaintenanceJob"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceJob_organizationId_jobNo_key" ON "MaintenanceJob"("organizationId", "jobNo");

-- CreateIndex
CREATE INDEX "EquipmentDocument_organizationId_validTo_idx" ON "EquipmentDocument"("organizationId", "validTo");

-- CreateIndex
CREATE INDEX "EquipmentDocument_equipmentId_idx" ON "EquipmentDocument"("equipmentId");

-- CreateIndex
CREATE INDEX "Driver_organizationId_isActive_idx" ON "Driver"("organizationId", "isActive");

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_maintenanceJobId_fkey" FOREIGN KEY ("maintenanceJobId") REFERENCES "MaintenanceJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_maintenanceJobId_fkey" FOREIGN KEY ("maintenanceJobId") REFERENCES "MaintenanceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_equipmentDocId_fkey" FOREIGN KEY ("equipmentDocId") REFERENCES "EquipmentDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceJob" ADD CONSTRAINT "MaintenanceJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceJob" ADD CONSTRAINT "MaintenanceJob_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceJob" ADD CONSTRAINT "MaintenanceJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceJob" ADD CONSTRAINT "MaintenanceJob_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceJob" ADD CONSTRAINT "MaintenanceJob_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentDocument" ADD CONSTRAINT "EquipmentDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentDocument" ADD CONSTRAINT "EquipmentDocument_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security (as in 20261013211500_tenant_rls)
ALTER TABLE "MaintenanceJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaintenanceJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MaintenanceJob"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "EquipmentDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EquipmentDocument"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "Driver" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Driver" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Driver"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
