-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "tallyExportId" TEXT;

-- AlterTable
ALTER TABLE "RaBill" ADD COLUMN     "tallyExportId" TEXT;

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "tallyExportId" TEXT;

-- AlterTable
ALTER TABLE "SubcontractBill" ADD COLUMN     "tallyExportId" TEXT;

-- AlterTable
ALTER TABLE "VendorBill" ADD COLUMN     "tallyExportId" TEXT;

-- AlterTable
ALTER TABLE "VendorPayment" ADD COLUMN     "tallyExportId" TEXT;

-- CreateTable
CREATE TABLE "TallyConfig" (
    "organizationId" TEXT NOT NULL,
    "companyName" TEXT,
    "stateCode" TEXT,
    "costCentres" BOOLEAN NOT NULL DEFAULT true,
    "ledgers" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TallyConfig_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "TallyExport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "upTo" DATE NOT NULL,
    "fromDate" DATE,
    "voucherCount" INTEGER NOT NULL,
    "counts" JSONB NOT NULL,
    "xml" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TallyExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TallyExport_organizationId_createdAt_idx" ON "TallyExport"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Expense_tallyExportId_idx" ON "Expense"("tallyExportId");

-- CreateIndex
CREATE INDEX "RaBill_tallyExportId_idx" ON "RaBill"("tallyExportId");

-- CreateIndex
CREATE INDEX "Receipt_tallyExportId_idx" ON "Receipt"("tallyExportId");

-- CreateIndex
CREATE INDEX "SubcontractBill_tallyExportId_idx" ON "SubcontractBill"("tallyExportId");

-- CreateIndex
CREATE INDEX "VendorBill_tallyExportId_idx" ON "VendorBill"("tallyExportId");

-- CreateIndex
CREATE INDEX "VendorPayment_tallyExportId_idx" ON "VendorPayment"("tallyExportId");

-- AddForeignKey
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_tallyExportId_fkey" FOREIGN KEY ("tallyExportId") REFERENCES "TallyExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractBill" ADD CONSTRAINT "SubcontractBill_tallyExportId_fkey" FOREIGN KEY ("tallyExportId") REFERENCES "TallyExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tallyExportId_fkey" FOREIGN KEY ("tallyExportId") REFERENCES "TallyExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBill" ADD CONSTRAINT "RaBill_tallyExportId_fkey" FOREIGN KEY ("tallyExportId") REFERENCES "TallyExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_tallyExportId_fkey" FOREIGN KEY ("tallyExportId") REFERENCES "TallyExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_tallyExportId_fkey" FOREIGN KEY ("tallyExportId") REFERENCES "TallyExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TallyConfig" ADD CONSTRAINT "TallyConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TallyExport" ADD CONSTRAINT "TallyExport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TallyExport" ADD CONSTRAINT "TallyExport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security: tenant isolation (see 20261013211500_tenant_rls)
ALTER TABLE "TallyConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TallyConfig" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TallyConfig"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

-- Row-level security: tenant isolation (see 20261013211500_tenant_rls)
ALTER TABLE "TallyExport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TallyExport" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TallyExport"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
