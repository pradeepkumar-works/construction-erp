-- Material reconciliation (v5 item 92): labour and machine hours per BOQ unit beside the material norms (rate analysis),
-- the estimate's overheads and profit per project, a reason on stock adjustments, and excess material recovered from a
-- subcontractor's next running bill.
-- Additive only: new enums, tables and nullable or defaulted columns.

-- CreateEnum
CREATE TYPE "BoqResourceKind" AS ENUM ('LABOUR', 'EQUIPMENT');

-- CreateEnum
CREATE TYPE "StockAdjustmentReason" AS ENUM ('OPENING', 'WASTAGE', 'DAMAGE', 'THEFT', 'COUNT_DIFFERENCE', 'OTHER');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "estimateOverheadPct" DECIMAL(5,2) NOT NULL DEFAULT 5,
ADD COLUMN     "estimateProfitPct" DECIMAL(5,2) NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "StockEntry" ADD COLUMN     "adjustmentReason" "StockAdjustmentReason";

-- AlterTable
ALTER TABLE "SubcontractBill" ADD COLUMN     "excessRecovery" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BoqResource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "kind" "BoqResourceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "qtyPerUnit" DECIMAL(18,6) NOT NULL,
    "note" TEXT,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoqResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExcessMaterialRecovery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "subcontractBillId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExcessMaterialRecovery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoqResource_projectId_idx" ON "BoqResource"("projectId");

-- CreateIndex
CREATE INDEX "BoqResource_organizationId_idx" ON "BoqResource"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BoqResource_boqItemId_kind_name_key" ON "BoqResource"("boqItemId", "kind", "name");

-- CreateIndex
CREATE INDEX "ExcessMaterialRecovery_workOrderId_idx" ON "ExcessMaterialRecovery"("workOrderId");

-- CreateIndex
CREATE INDEX "ExcessMaterialRecovery_subcontractBillId_idx" ON "ExcessMaterialRecovery"("subcontractBillId");

-- CreateIndex
CREATE INDEX "ExcessMaterialRecovery_organizationId_idx" ON "ExcessMaterialRecovery"("organizationId");

-- AddForeignKey
ALTER TABLE "BoqResource" ADD CONSTRAINT "BoqResource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqResource" ADD CONSTRAINT "BoqResource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqResource" ADD CONSTRAINT "BoqResource_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqResource" ADD CONSTRAINT "BoqResource_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcessMaterialRecovery" ADD CONSTRAINT "ExcessMaterialRecovery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcessMaterialRecovery" ADD CONSTRAINT "ExcessMaterialRecovery_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcessMaterialRecovery" ADD CONSTRAINT "ExcessMaterialRecovery_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcessMaterialRecovery" ADD CONSTRAINT "ExcessMaterialRecovery_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcessMaterialRecovery" ADD CONSTRAINT "ExcessMaterialRecovery_subcontractBillId_fkey" FOREIGN KEY ("subcontractBillId") REFERENCES "SubcontractBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcessMaterialRecovery" ADD CONSTRAINT "ExcessMaterialRecovery_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security, as for every tenant table (see 20261013211500_tenant_rls).
ALTER TABLE "BoqResource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BoqResource" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BoqResource"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "ExcessMaterialRecovery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExcessMaterialRecovery" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ExcessMaterialRecovery"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
