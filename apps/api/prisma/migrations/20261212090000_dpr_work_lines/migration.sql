-- DPR work lines (item 127): a DPR's lines are progress entries with their crew, machines and material

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "progressFromDpr" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProgressEntry" ADD COLUMN     "dailyReportId" TEXT,
ADD COLUMN     "labour" JSONB,
ADD COLUMN     "machines" JSONB,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "workOrderId" TEXT;

-- CreateTable
CREATE TABLE "ProgressMaterial" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "progressEntryId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgressMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgressMaterial_progressEntryId_idx" ON "ProgressMaterial"("progressEntryId");

-- CreateIndex
CREATE INDEX "ProgressMaterial_organizationId_itemId_idx" ON "ProgressMaterial"("organizationId", "itemId");

-- CreateIndex
CREATE INDEX "ProgressEntry_dailyReportId_idx" ON "ProgressEntry"("dailyReportId");

-- AddForeignKey
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_dailyReportId_fkey" FOREIGN KEY ("dailyReportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressMaterial" ADD CONSTRAINT "ProgressMaterial_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressMaterial" ADD CONSTRAINT "ProgressMaterial_progressEntryId_fkey" FOREIGN KEY ("progressEntryId") REFERENCES "ProgressEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressMaterial" ADD CONSTRAINT "ProgressMaterial_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant isolation (see 20261013211500_tenant_rls)
ALTER TABLE "ProgressMaterial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgressMaterial" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProgressMaterial"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
