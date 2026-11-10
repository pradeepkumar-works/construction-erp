-- TDS after review: a challan deposited and booked by hand before Nirmaan kept TDS posts nothing again; a lower
-- deduction certificate whose limit runs out inside a payment covers only its part; and the backfill's base and reasons.
ALTER TABLE "TdsChallan" ADD COLUMN "inBooks" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TdsDeduction" ADD COLUMN "certificateBase" DECIMAL(18,2);

-- A backfilled vendor payment against a bill, its section still to confirm: TDS is on the value before GST, so the
-- bill's GST share comes off the base (as gstShareOf does for a new payment), never below the TDS itself.
UPDATE "TdsDeduction" d
SET "amountPaid" = d."amountPaid" - round(d."amountPaid" * b."gstAmount" / b."total", 2)
FROM "VendorPayment" p
JOIN "VendorBill" b ON b."id" = p."vendorBillId"
WHERE d."backfilled" AND d."section" IS NULL AND d."challanId" IS NULL AND d."vendorPaymentId" = p."id"
  AND b."total" > 0 AND b."gstAmount" > 0
  AND d."amountPaid" - round(d."amountPaid" * b."gstAmount" / b."total", 2) >= d."tdsAmount";

-- Deducted at the higher rate for want of a PAN (206AA): reason C on the return, as a new deduction carries it.
UPDATE "TdsDeduction"
SET "reason" = 'C'
WHERE "backfilled" AND "reason" IS NULL AND "deducteePan" IS NULL AND "section" IN ('194C', '192') AND "rate" >= 20;
