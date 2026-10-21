-- Payment requests and advances (v5 item 90): a request to pay a bill or an advance against a PO or work order,
-- approved through the matrix before accounts pays; advance payments; advance adjusted on vendor bills.
-- CreateEnum
CREATE TYPE "PaymentRequestKind" AS ENUM ('BILL', 'PO_ADVANCE', 'WO_ADVANCE');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "paymentRequestId" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "paymentsNeedRequest" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "VendorBill" ADD COLUMN     "advanceAdjusted" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VendorPayment" ADD COLUMN     "paymentRequestId" TEXT,
ADD COLUMN     "purchaseOrderId" TEXT,
ADD COLUMN     "workOrderId" TEXT;

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "requestNo" TEXT NOT NULL,
    "kind" "PaymentRequestKind" NOT NULL,
    "vendorBillId" TEXT,
    "subcontractBillId" TEXT,
    "purchaseOrderId" TEXT,
    "workOrderId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL DEFAULT 'BANK',
    "neededBy" DATE,
    "reason" TEXT,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paidDate" DATE,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentRequest_organizationId_status_idx" ON "PaymentRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PaymentRequest_projectId_status_idx" ON "PaymentRequest"("projectId", "status");

-- CreateIndex
CREATE INDEX "PaymentRequest_vendorBillId_idx" ON "PaymentRequest"("vendorBillId");

-- CreateIndex
CREATE INDEX "PaymentRequest_subcontractBillId_idx" ON "PaymentRequest"("subcontractBillId");

-- CreateIndex
CREATE INDEX "PaymentRequest_purchaseOrderId_idx" ON "PaymentRequest"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PaymentRequest_workOrderId_idx" ON "PaymentRequest"("workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_organizationId_requestNo_key" ON "PaymentRequest"("organizationId", "requestNo");

-- CreateIndex
CREATE INDEX "Attachment_paymentRequestId_idx" ON "Attachment"("paymentRequestId");

-- CreateIndex
CREATE INDEX "VendorPayment_purchaseOrderId_idx" ON "VendorPayment"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "VendorPayment_workOrderId_idx" ON "VendorPayment"("workOrderId");

-- CreateIndex
CREATE INDEX "VendorPayment_paymentRequestId_idx" ON "VendorPayment"("paymentRequestId");

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "VendorBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_subcontractBillId_fkey" FOREIGN KEY ("subcontractBillId") REFERENCES "SubcontractBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A payment is against one bill, or (an advance) against one order with no bill.
ALTER TABLE "VendorPayment" DROP CONSTRAINT "VendorPayment_one_bill";
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_one_bill" CHECK (
  num_nonnulls("vendorBillId", "subcontractBillId") = 1
  OR (num_nonnulls("vendorBillId", "subcontractBillId") = 0 AND num_nonnulls("purchaseOrderId", "workOrderId") = 1)
);

-- A request is for exactly one bill or order, matching its kind.
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_one_target" CHECK (
  ("kind" = 'BILL' AND num_nonnulls("vendorBillId", "subcontractBillId") = 1 AND num_nonnulls("purchaseOrderId", "workOrderId") = 0)
  OR ("kind" = 'PO_ADVANCE' AND "purchaseOrderId" IS NOT NULL AND num_nonnulls("vendorBillId", "subcontractBillId", "workOrderId") = 0)
  OR ("kind" = 'WO_ADVANCE' AND "workOrderId" IS NOT NULL AND num_nonnulls("vendorBillId", "subcontractBillId", "purchaseOrderId") = 0)
);

-- Row-level security, as on every tenant table (20261013211500_tenant_rls).
ALTER TABLE "PaymentRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PaymentRequest"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
