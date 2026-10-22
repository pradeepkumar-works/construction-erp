-- CreateEnum
CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('SUBMITTED', 'RETURNED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SupplierChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SUPPLIER';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "supplierInvoiceId" TEXT;

-- AlterTable

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "supplierAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "supplierAcceptedById" TEXT,
ADD COLUMN     "supplierNote" TEXT;

-- AlterTable
ALTER TABLE "StockEntry" ADD COLUMN     "supplierDispatchId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "vendorId" TEXT;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "supplierAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "supplierAcceptedById" TEXT,
ADD COLUMN     "supplierNote" TEXT;

-- CreateTable
CREATE TABLE "SupplierDispatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "dispatchNo" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "vehicleNo" TEXT,
    "lrNo" TEXT,
    "transporter" TEXT,
    "remarks" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierDispatchLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "SupplierDispatchLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "workOrderId" TEXT,
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "gstAmount" DECIMAL(18,2),
    "notes" TEXT,
    "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'SUBMITTED',
    "returnNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierChangeRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "previous" JSONB NOT NULL,
    "status" "SupplierChangeStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierDispatch_organizationId_idx" ON "SupplierDispatch"("organizationId");

-- CreateIndex
CREATE INDEX "SupplierDispatch_purchaseOrderId_idx" ON "SupplierDispatch"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierDispatch_vendorId_dispatchNo_key" ON "SupplierDispatch"("vendorId", "dispatchNo");

-- CreateIndex
CREATE INDEX "SupplierDispatchLine_dispatchId_idx" ON "SupplierDispatchLine"("dispatchId");

-- CreateIndex
CREATE INDEX "SupplierDispatchLine_purchaseOrderLineId_idx" ON "SupplierDispatchLine"("purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "SupplierInvoice_organizationId_status_idx" ON "SupplierInvoice"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierInvoice_vendorId_invoiceNo_key" ON "SupplierInvoice"("vendorId", "invoiceNo");

-- CreateIndex
CREATE INDEX "SupplierChangeRequest_organizationId_status_idx" ON "SupplierChangeRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SupplierChangeRequest_vendorId_idx" ON "SupplierChangeRequest"("vendorId");

-- CreateIndex
CREATE INDEX "Attachment_supplierInvoiceId_idx" ON "Attachment"("supplierInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "StockEntry_supplierDispatchId_key" ON "StockEntry"("supplierDispatchId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierAcceptedById_fkey" FOREIGN KEY ("supplierAcceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_supplierAcceptedById_fkey" FOREIGN KEY ("supplierAcceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_supplierDispatchId_fkey" FOREIGN KEY ("supplierDispatchId") REFERENCES "SupplierDispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_supplierInvoiceId_fkey" FOREIGN KEY ("supplierInvoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDispatch" ADD CONSTRAINT "SupplierDispatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDispatch" ADD CONSTRAINT "SupplierDispatch_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDispatch" ADD CONSTRAINT "SupplierDispatch_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDispatch" ADD CONSTRAINT "SupplierDispatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDispatchLine" ADD CONSTRAINT "SupplierDispatchLine_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "SupplierDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDispatchLine" ADD CONSTRAINT "SupplierDispatchLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierChangeRequest" ADD CONSTRAINT "SupplierChangeRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierChangeRequest" ADD CONSTRAINT "SupplierChangeRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierChangeRequest" ADD CONSTRAINT "SupplierChangeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierChangeRequest" ADD CONSTRAINT "SupplierChangeRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Every company gets the supplier portal's role (new companies get it at sign-up).
INSERT INTO "Role" ("id", "organizationId", "key", "name") SELECT gen_random_uuid()::text, o."id", 'SUPPLIER', 'Supplier (portal)' FROM "Organization" o ON CONFLICT ("organizationId", "key") DO NOTHING;

-- Row-level security
ALTER TABLE "SupplierDispatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierDispatch" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SupplierDispatch"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "SupplierDispatchLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierDispatchLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SupplierDispatchLine"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "SupplierInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierInvoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SupplierInvoice"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "SupplierChangeRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierChangeRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SupplierChangeRequest"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
