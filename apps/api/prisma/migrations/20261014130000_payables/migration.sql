-- AlterTable
ALTER TABLE "SubcontractBill" ADD COLUMN     "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paidDate" DATE;

-- AlterTable
ALTER TABLE "VendorBill" ADD COLUMN     "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paidDate" DATE;

-- CreateTable
CREATE TABLE "VendorPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "vendorBillId" TEXT,
    "subcontractBillId" TEXT,
    "paymentDate" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL DEFAULT 'BANK',
    "reference" TEXT,
    "tdsAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherDeduction" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherDeductionNote" TEXT,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorPayment_organizationId_paymentDate_idx" ON "VendorPayment"("organizationId", "paymentDate");

-- CreateIndex
CREATE INDEX "VendorPayment_projectId_idx" ON "VendorPayment"("projectId");

-- CreateIndex
CREATE INDEX "VendorPayment_vendorId_idx" ON "VendorPayment"("vendorId");

-- CreateIndex
CREATE INDEX "VendorPayment_vendorBillId_idx" ON "VendorPayment"("vendorBillId");

-- CreateIndex
CREATE INDEX "VendorPayment_subcontractBillId_idx" ON "VendorPayment"("subcontractBillId");

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "VendorBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_subcontractBillId_fkey" FOREIGN KEY ("subcontractBillId") REFERENCES "SubcontractBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A payment is against exactly one bill
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_one_bill" CHECK (("vendorBillId" IS NULL) <> ("subcontractBillId" IS NULL));

-- Row-level security: tenant isolation (see 20261013211500_tenant_rls)
ALTER TABLE "VendorPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorPayment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VendorPayment"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
