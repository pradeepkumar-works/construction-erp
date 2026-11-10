-- Bank payment batches (ARCHITECTURE "Bank payments"): approved payment requests paid in one bank upload.

-- CreateEnum
CREATE TYPE "PaymentBatchStatus" AS ENUM ('DRAFT', 'EXPORTED', 'SETTLED');

-- CreateTable
CREATE TABLE "PaymentBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "debitAccount" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" "PaymentBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "exportedById" TEXT,
    "exportedAt" TIMESTAMP(3),
    "paymentDate" DATE,
    "fileName" TEXT,
    "fileContent" TEXT,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "PaymentBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentBatchLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "paymentRequestId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "leftOut" TEXT,
    "accountNo" TEXT,
    "ifsc" TEXT,
    "payMode" TEXT,
    "vendorPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentBatchLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentBatch_organizationId_status_idx" ON "PaymentBatch"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentBatch_organizationId_batchNo_key" ON "PaymentBatch"("organizationId", "batchNo");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentBatchLine_vendorPaymentId_key" ON "PaymentBatchLine"("vendorPaymentId");

-- CreateIndex
CREATE INDEX "PaymentBatchLine_organizationId_paymentRequestId_idx" ON "PaymentBatchLine"("organizationId", "paymentRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentBatchLine_batchId_paymentRequestId_key" ON "PaymentBatchLine"("batchId", "paymentRequestId");

-- AddForeignKey
ALTER TABLE "PaymentBatch" ADD CONSTRAINT "PaymentBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatch" ADD CONSTRAINT "PaymentBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatch" ADD CONSTRAINT "PaymentBatch_exportedById_fkey" FOREIGN KEY ("exportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatchLine" ADD CONSTRAINT "PaymentBatchLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatchLine" ADD CONSTRAINT "PaymentBatchLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PaymentBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatchLine" ADD CONSTRAINT "PaymentBatchLine_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatchLine" ADD CONSTRAINT "PaymentBatchLine_vendorPaymentId_fkey" FOREIGN KEY ("vendorPaymentId") REFERENCES "VendorPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A request is in at most one open batch, so a file made twice never pays twice.
CREATE UNIQUE INDEX "PaymentBatchLine_open_request_key" ON "PaymentBatchLine"("paymentRequestId") WHERE "open";

-- A line pays something.
ALTER TABLE "PaymentBatchLine" ADD CONSTRAINT "PaymentBatchLine_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "PaymentBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentBatch" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PaymentBatch"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "PaymentBatchLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentBatchLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PaymentBatchLine"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
