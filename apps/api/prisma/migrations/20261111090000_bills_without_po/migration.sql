-- Bills without a PO and debit notes (v5 item 91): vendor bill kinds (hire, service, other), hire terms on machines,
-- logs and job cards linked to the bill that billed them, and debit notes that reduce what we owe.
-- Additive only: new enums, tables and nullable or defaulted columns; the PO columns on bills become nullable.

-- CreateEnum
CREATE TYPE "VendorBillKind" AS ENUM ('PO', 'HIRE', 'SERVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "HireFuelBy" AS ENUM ('OWNER', 'COMPANY');

-- CreateEnum
CREATE TYPE "DebitNoteReason" AS ENUM ('SHORTAGE', 'EXCESS', 'REJECTED', 'RETURNED', 'RATE_DIFFERENCE', 'OTHER');

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "hireFuelBy" "HireFuelBy",
ADD COLUMN     "hireMinHours" DECIMAL(18,2),
ADD COLUMN     "hireOperator" BOOLEAN;

-- AlterTable
ALTER TABLE "MachineryLog" ADD COLUMN     "vendorBillId" TEXT;

-- AlterTable
ALTER TABLE "MaintenanceJob" ADD COLUMN     "vendorBillId" TEXT;

-- AlterTable
ALTER TABLE "SubcontractBill" ADD COLUMN     "debitNoteAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VendorBill" ADD COLUMN     "debitNoteAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "equipmentId" TEXT,
ADD COLUMN     "expenseCategory" "ExpenseCategory",
ADD COLUMN     "fuelLitres" DECIMAL(18,3) NOT NULL DEFAULT 0,
ADD COLUMN     "fuelRate" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "fuelRecovery" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "hireMonth" DATE,
ADD COLUMN     "kind" "VendorBillKind" NOT NULL DEFAULT 'PO',
ALTER COLUMN "purchaseOrderId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "VendorBillLine" ADD COLUMN     "description" TEXT,
ADD COLUMN     "unit" TEXT,
ALTER COLUMN "purchaseOrderLineId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "DebitNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "noteNo" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" "DebitNoteReason" NOT NULL,
    "vendorBillId" TEXT,
    "subcontractBillId" TEXT,
    "stockEntryId" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "gstAmount" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelNote" TEXT,
    "tallyExportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebitNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebitNoteLine" (
    "id" TEXT NOT NULL,
    "debitNoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3),
    "unit" TEXT,
    "rate" DECIMAL(18,2),
    "amount" DECIMAL(18,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DebitNoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DebitNote_organizationId_date_idx" ON "DebitNote"("organizationId", "date");

-- CreateIndex
CREATE INDEX "DebitNote_vendorBillId_idx" ON "DebitNote"("vendorBillId");

-- CreateIndex
CREATE INDEX "DebitNote_subcontractBillId_idx" ON "DebitNote"("subcontractBillId");

-- CreateIndex
CREATE INDEX "DebitNote_stockEntryId_idx" ON "DebitNote"("stockEntryId");

-- CreateIndex
CREATE INDEX "DebitNote_tallyExportId_idx" ON "DebitNote"("tallyExportId");

-- CreateIndex
CREATE UNIQUE INDEX "DebitNote_organizationId_noteNo_key" ON "DebitNote"("organizationId", "noteNo");

-- CreateIndex
CREATE INDEX "DebitNoteLine_debitNoteId_idx" ON "DebitNoteLine"("debitNoteId");

-- CreateIndex
CREATE INDEX "MachineryLog_vendorBillId_idx" ON "MachineryLog"("vendorBillId");

-- CreateIndex
CREATE INDEX "MaintenanceJob_vendorBillId_idx" ON "MaintenanceJob"("vendorBillId");

-- CreateIndex
CREATE INDEX "VendorBill_equipmentId_hireMonth_idx" ON "VendorBill"("equipmentId", "hireMonth");

-- AddForeignKey
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "VendorBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_subcontractBillId_fkey" FOREIGN KEY ("subcontractBillId") REFERENCES "SubcontractBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_stockEntryId_fkey" FOREIGN KEY ("stockEntryId") REFERENCES "StockEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_tallyExportId_fkey" FOREIGN KEY ("tallyExportId") REFERENCES "TallyExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNoteLine" ADD CONSTRAINT "DebitNoteLine_debitNoteId_fkey" FOREIGN KEY ("debitNoteId") REFERENCES "DebitNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineryLog" ADD CONSTRAINT "MachineryLog_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "VendorBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceJob" ADD CONSTRAINT "MaintenanceJob_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "VendorBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A debit note is against exactly one bill: a vendor bill or a subcontract bill.
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_one_bill_check"
  CHECK (("vendorBillId" IS NOT NULL)::int + ("subcontractBillId" IS NOT NULL)::int = 1);

-- A PO bill names its order.
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_po_kind_check"
  CHECK ("kind" <> 'PO' OR "purchaseOrderId" IS NOT NULL);

-- Row-level security on the new tenant table (see 20261013211500_tenant_rls).
ALTER TABLE "DebitNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DebitNote" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DebitNote"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
