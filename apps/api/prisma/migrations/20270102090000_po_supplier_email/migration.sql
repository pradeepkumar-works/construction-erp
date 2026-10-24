-- The reason a PO is not from the lowest complete quotation on its request, and the order emailed to the vendor.
ALTER TABLE "PurchaseOrder" ADD COLUMN "selectionReason" TEXT,
ADD COLUMN "supplierEmailedAt" TIMESTAMP(3),
ADD COLUMN "supplierEmailTo" TEXT,
ADD COLUMN "supplierEmailError" TEXT;
