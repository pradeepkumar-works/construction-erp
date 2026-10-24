-- EPC packages and engineering deliverables (item 130): deliverables by discipline, equipment packages with their stage
-- dates, client inputs on milestones, payment stages that read them, and the contract currency.

-- CreateEnum
CREATE TYPE "EngineeringDiscipline" AS ENUM ('PROCESS', 'CIVIL', 'MECHANICAL', 'ELECTRICAL', 'INSTRUMENTATION');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('NOT_STARTED', 'SUBMITTED', 'COMMENTS', 'APPROVED');

-- CreateEnum
CREATE TYPE "PackageStage" AS ENUM ('ENQUIRY', 'ORDERED', 'DRAWINGS_APPROVED', 'MANUFACTURED', 'INSPECTED', 'DISPATCH_CLEARED', 'DISPATCHED', 'SHIPPED', 'CUSTOMS_CLEARED', 'DELIVERED', 'ERECTED', 'COMMISSIONED');

-- AlterTable
ALTER TABLE "BillingStage" ADD COLUMN     "deliverableIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "packageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "packageStage" "PackageStage";

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "byClient" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "delayId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
ADD COLUMN     "exchangeRate" DECIMAL(12,6);

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "exchangeRate" DECIMAL(12,6);

-- CreateTable
CREATE TABLE "EngineeringDeliverable" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workElementId" TEXT,
    "discipline" "EngineeringDiscipline" NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentId" TEXT,
    "plannedSubmitOn" DATE,
    "plannedApprovalOn" DATE,
    "submittedOn" DATE,
    "revision" TEXT,
    "approvalCode" TEXT,
    "approvedOn" DATE,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngineeringDeliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementPackage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workElementId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discipline" "EngineeringDiscipline" NOT NULL,
    "vendorId" TEXT,
    "purchaseOrderId" TEXT,
    "scope" TEXT,
    "value" DECIMAL(18,2),
    "neededOn" DATE,
    "vessel" TEXT,
    "billOfLading" TEXT,
    "eta" DATE,
    "portToSiteDays" INTEGER,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageStageDate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "stage" "PackageStage" NOT NULL,
    "plannedOn" DATE,
    "actualOn" DATE,

    CONSTRAINT "PackageStageDate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EngineeringDeliverable_projectId_discipline_idx" ON "EngineeringDeliverable"("projectId", "discipline");

-- CreateIndex
CREATE INDEX "EngineeringDeliverable_organizationId_idx" ON "EngineeringDeliverable"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "EngineeringDeliverable_projectId_code_key" ON "EngineeringDeliverable"("projectId", "code");

-- CreateIndex
CREATE INDEX "ProcurementPackage_projectId_idx" ON "ProcurementPackage"("projectId");

-- CreateIndex
CREATE INDEX "ProcurementPackage_organizationId_idx" ON "ProcurementPackage"("organizationId");

-- CreateIndex
CREATE INDEX "ProcurementPackage_vendorId_idx" ON "ProcurementPackage"("vendorId");

-- CreateIndex
CREATE INDEX "ProcurementPackage_purchaseOrderId_idx" ON "ProcurementPackage"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementPackage_projectId_code_key" ON "ProcurementPackage"("projectId", "code");

-- CreateIndex
CREATE INDEX "PackageStageDate_organizationId_idx" ON "PackageStageDate"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageStageDate_packageId_stage_key" ON "PackageStageDate"("packageId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_delayId_key" ON "Milestone"("delayId");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_delayId_fkey" FOREIGN KEY ("delayId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringDeliverable" ADD CONSTRAINT "EngineeringDeliverable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringDeliverable" ADD CONSTRAINT "EngineeringDeliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringDeliverable" ADD CONSTRAINT "EngineeringDeliverable_workElementId_fkey" FOREIGN KEY ("workElementId") REFERENCES "WorkElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringDeliverable" ADD CONSTRAINT "EngineeringDeliverable_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementPackage" ADD CONSTRAINT "ProcurementPackage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementPackage" ADD CONSTRAINT "ProcurementPackage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementPackage" ADD CONSTRAINT "ProcurementPackage_workElementId_fkey" FOREIGN KEY ("workElementId") REFERENCES "WorkElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementPackage" ADD CONSTRAINT "ProcurementPackage_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementPackage" ADD CONSTRAINT "ProcurementPackage_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageStageDate" ADD CONSTRAINT "PackageStageDate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageStageDate" ADD CONSTRAINT "PackageStageDate_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ProcurementPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security (copy of 20261013211500_tenant_rls)
ALTER TABLE "EngineeringDeliverable" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EngineeringDeliverable" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EngineeringDeliverable"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "ProcurementPackage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProcurementPackage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProcurementPackage"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "PackageStageDate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PackageStageDate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PackageStageDate"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
