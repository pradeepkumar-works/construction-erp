-- Plans and billing (v3 item 34): trial and paid-up dates on the company, and one row per subscription payment
-- with its GST invoice.
-- CreateEnum
CREATE TYPE "BillingPaymentStatus" AS ENUM ('CREATED', 'PAID');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "billingAddress" TEXT,
ADD COLUMN     "billingGstin" TEXT,
ADD COLUMN     "billingName" TEXT,
ADD COLUMN     "billingRemindedFor" TEXT,
ADD COLUMN     "billingStateCode" TEXT,
ADD COLUMN     "paidUntil" DATE,
ADD COLUMN     "trialEndsAt" DATE;

-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "BillingPaymentStatus" NOT NULL DEFAULT 'CREATED',
    "razorpayOrderId" TEXT NOT NULL,
    "razorpayPaymentId" TEXT,
    "unit" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "months" INTEGER NOT NULL,
    "chargedMonths" INTEGER NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "taxable" DECIMAL(18,2) NOT NULL,
    "cgst" DECIMAL(18,2) NOT NULL,
    "sgst" DECIMAL(18,2) NOT NULL,
    "igst" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerGstin" TEXT,
    "buyerAddress" TEXT,
    "buyerStateCode" TEXT NOT NULL,
    "sellerStateCode" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "invoiceNo" TEXT,
    "invoiceDate" DATE,
    "periodFrom" DATE,
    "periodTo" DATE,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_razorpayOrderId_key" ON "BillingPayment"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_razorpayPaymentId_key" ON "BillingPayment"("razorpayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_invoiceNo_key" ON "BillingPayment"("invoiceNo");

-- CreateIndex
CREATE INDEX "BillingPayment_organizationId_createdAt_idx" ON "BillingPayment"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Tenant isolation (see 20261013211500_tenant_rls)
ALTER TABLE "BillingPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingPayment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BillingPayment" USING (app_current_org() IS NULL OR "organizationId" = app_current_org()) WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
