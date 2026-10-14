-- CreateEnum
CREATE TYPE "ReceiptKind" AS ENUM ('BILL', 'RETENTION_RELEASE', 'DEPOSIT_RELEASE');

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ReceiptKind" NOT NULL DEFAULT 'BILL',
    "billId" TEXT,
    "receiptDate" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL DEFAULT 'BANK',
    "reference" TEXT,
    "tdsAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gstTdsAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "retentionAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "securityDepositAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "advanceRecoveryAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "labourCessAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherDeduction" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherDeductionNote" TEXT,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Receipt_organizationId_receiptDate_idx" ON "Receipt"("organizationId", "receiptDate");

-- CreateIndex
CREATE INDEX "Receipt_projectId_idx" ON "Receipt"("projectId");

-- CreateIndex
CREATE INDEX "Receipt_billId_idx" ON "Receipt"("billId");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_billId_fkey" FOREIGN KEY ("billId") REFERENCES "RaBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Tenant isolation (see 20261013211500_tenant_rls)
ALTER TABLE "Receipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Receipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Receipt"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
