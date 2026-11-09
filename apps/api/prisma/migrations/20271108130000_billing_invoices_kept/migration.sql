-- A company's GST invoices outlive the company: erasing it leaves its paid invoices with no company,
-- so invoice numbers are never reused and the tax records stay complete. Nothing is removed.
ALTER TABLE "BillingPayment" ALTER COLUMN "organizationId" DROP NOT NULL;

ALTER TABLE "BillingPayment" DROP CONSTRAINT "BillingPayment_organizationId_fkey";
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
