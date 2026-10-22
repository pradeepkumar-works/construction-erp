-- Site fund requests (v6 item 107): a site asks head office for money as a payment request of kind FUND_REQUEST,
-- for a purpose, released into the site's imprest or paid to a party on account, optionally raised by another site.

-- CreateEnum
CREATE TYPE "FundPurpose" AS ENUM ('WAGES', 'LOCAL_PURCHASE', 'PETTY_CONTRACTOR', 'SITE_RUNNING', 'OTHER');

-- AlterEnum
ALTER TYPE "PaymentRequestKind" ADD VALUE 'FUND_REQUEST';

-- A fund request released into an imprest has no party.
ALTER TABLE "PaymentRequest" ALTER COLUMN "vendorId" DROP NOT NULL;
ALTER TABLE "PaymentRequest" ADD COLUMN "imprestId" TEXT,
ADD COLUMN "purpose" "FundPurpose",
ADD COLUMN "raisedAtProjectId" TEXT;

-- The release into an imprest is a paid advance on it.
ALTER TABLE "ImprestEntry" ADD COLUMN "paymentRequestId" TEXT;

CREATE INDEX "ImprestEntry_paymentRequestId_idx" ON "ImprestEntry"("paymentRequestId");
CREATE INDEX "PaymentRequest_imprestId_idx" ON "PaymentRequest"("imprestId");
CREATE INDEX "PaymentRequest_raisedAtProjectId_idx" ON "PaymentRequest"("raisedAtProjectId");

ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_imprestId_fkey" FOREIGN KEY ("imprestId") REFERENCES "Imprest"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_raisedAtProjectId_fkey" FOREIGN KEY ("raisedAtProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImprestEntry" ADD CONSTRAINT "ImprestEntry_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- A request is for exactly one bill or order, matching its kind, and names its party; a fund request has no bill or
-- order and goes to exactly one of an imprest or a party. (The new kind is compared as text: an enum value added in
-- this transaction cannot be used as a literal until it commits.)
ALTER TABLE "PaymentRequest" DROP CONSTRAINT "PaymentRequest_one_target";
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_one_target" CHECK (
  ("kind"::text = 'BILL' AND "vendorId" IS NOT NULL AND num_nonnulls("vendorBillId", "subcontractBillId") = 1 AND num_nonnulls("purchaseOrderId", "workOrderId", "imprestId") = 0)
  OR ("kind"::text = 'PO_ADVANCE' AND "vendorId" IS NOT NULL AND "purchaseOrderId" IS NOT NULL AND num_nonnulls("vendorBillId", "subcontractBillId", "workOrderId", "imprestId") = 0)
  OR ("kind"::text = 'WO_ADVANCE' AND "vendorId" IS NOT NULL AND "workOrderId" IS NOT NULL AND num_nonnulls("vendorBillId", "subcontractBillId", "purchaseOrderId", "imprestId") = 0)
  OR ("kind"::text = 'FUND_REQUEST' AND "purpose" IS NOT NULL AND num_nonnulls("vendorId", "imprestId") = 1 AND num_nonnulls("vendorBillId", "subcontractBillId", "purchaseOrderId", "workOrderId") = 0)
);

-- A payment is against one bill, or an advance on one order, or (a fund request paid to a party) on account of its
-- request.
ALTER TABLE "VendorPayment" DROP CONSTRAINT "VendorPayment_one_bill";
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_one_bill" CHECK (
  num_nonnulls("vendorBillId", "subcontractBillId") = 1
  OR (num_nonnulls("vendorBillId", "subcontractBillId") = 0 AND num_nonnulls("purchaseOrderId", "workOrderId") = 1)
  OR (num_nonnulls("vendorBillId", "subcontractBillId", "purchaseOrderId", "workOrderId") = 0 AND "paymentRequestId" IS NOT NULL)
);
