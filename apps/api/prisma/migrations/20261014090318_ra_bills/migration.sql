-- CreateEnum
CREATE TYPE "BillStage" AS ENUM ('NOT_SENT', 'SENT', 'CERTIFIED', 'PAID');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "raBillId" TEXT;

-- AlterTable
ALTER TABLE "MeasurementSheet" ADD COLUMN     "raBillId" TEXT;

-- CreateTable
CREATE TABLE "RaBill" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "billNo" INTEGER NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "billDate" DATE NOT NULL,
    "measuredUpTo" DATE NOT NULL,
    "remarks" TEXT,
    "grossPrevious" DECIMAL(18,2) NOT NULL,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "grossUpto" DECIMAL(18,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "gstAmount" DECIMAL(18,2) NOT NULL,
    "retentionPct" DECIMAL(5,2) NOT NULL,
    "securityDepositPct" DECIMAL(5,2) NOT NULL,
    "advanceRecoveryPct" DECIMAL(5,2) NOT NULL,
    "tdsPct" DECIMAL(5,2) NOT NULL,
    "gstTdsPct" DECIMAL(5,2) NOT NULL,
    "labourCessPct" DECIMAL(5,2) NOT NULL,
    "retentionAmount" DECIMAL(18,2) NOT NULL,
    "securityDepositAmount" DECIMAL(18,2) NOT NULL,
    "advanceRecoveryAmount" DECIMAL(18,2) NOT NULL,
    "tdsAmount" DECIMAL(18,2) NOT NULL,
    "gstTdsAmount" DECIMAL(18,2) NOT NULL,
    "labourCessAmount" DECIMAL(18,2) NOT NULL,
    "otherDeduction" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherDeductionNote" TEXT,
    "totalDeductions" DECIMAL(18,2) NOT NULL,
    "netPayable" DECIMAL(18,2) NOT NULL,
    "claimedGross" DECIMAL(18,2),
    "claimedNet" DECIMAL(18,2),
    "stage" "BillStage" NOT NULL DEFAULT 'NOT_SENT',
    "sentDate" DATE,
    "certifiedDate" DATE,
    "certificateNo" TEXT,
    "paidDate" DATE,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaBillItem" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "boqQty" DECIMAL(18,3) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "prevQty" DECIMAL(18,3) NOT NULL,
    "thisQty" DECIMAL(18,3) NOT NULL,
    "uptoQty" DECIMAL(18,3) NOT NULL,
    "certifiedQty" DECIMAL(18,3),
    "amount" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RaBillItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RaBill_organizationId_status_idx" ON "RaBill"("organizationId", "status");

-- CreateIndex
CREATE INDEX "RaBill_projectId_status_idx" ON "RaBill"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RaBill_projectId_billNo_key" ON "RaBill"("projectId", "billNo");

-- CreateIndex
CREATE INDEX "RaBillItem_boqItemId_idx" ON "RaBillItem"("boqItemId");

-- CreateIndex
CREATE UNIQUE INDEX "RaBillItem_billId_boqItemId_key" ON "RaBillItem"("billId", "boqItemId");

-- AddForeignKey
ALTER TABLE "MeasurementSheet" ADD CONSTRAINT "MeasurementSheet_raBillId_fkey" FOREIGN KEY ("raBillId") REFERENCES "RaBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBill" ADD CONSTRAINT "RaBill_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBill" ADD CONSTRAINT "RaBill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBill" ADD CONSTRAINT "RaBill_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBill" ADD CONSTRAINT "RaBill_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBillItem" ADD CONSTRAINT "RaBillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "RaBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaBillItem" ADD CONSTRAINT "RaBillItem_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_raBillId_fkey" FOREIGN KEY ("raBillId") REFERENCES "RaBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tenant row-level security (see 20261013211500_tenant_rls). RaBillItem is reached only through its bill.
ALTER TABLE "RaBill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RaBill" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RaBill"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
