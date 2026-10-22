-- CreateEnum
CREATE TYPE "MixDesignStatus" AS ENUM ('DRAFT', 'APPROVED', 'RETIRED');

-- CreateEnum
CREATE TYPE "RmcOrderStatus" AS ENUM ('QUOTED', 'CONFIRMED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RmcBatchStatus" AS ENUM ('DISPATCHED', 'DELIVERED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RmcInvoiceStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "ProjectType" ADD VALUE 'PLANT';

-- AlterTable
ALTER TABLE "QualityTest" ADD COLUMN     "rmcBatchId" TEXT;

-- CreateTable
CREATE TABLE "MixDesign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "description" TEXT,
    "slumpMm" INTEGER,
    "status" "MixDesignStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MixDesign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MixDesignLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mixDesignId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MixDesignLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RmcOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "RmcOrderStatus" NOT NULL DEFAULT 'QUOTED',
    "clientId" TEXT,
    "projectId" TEXT,
    "site" TEXT,
    "mixDesignId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "pumpRate" DECIMAL(18,2),
    "pourDate" DATE,
    "validUntil" DATE,
    "notes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RmcOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RmcBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "mixDesignId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dispatchedAt" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "truck" TEXT,
    "driver" TEXT,
    "pumped" BOOLEAN NOT NULL DEFAULT false,
    "slumpMm" INTEGER,
    "status" "RmcBatchStatus" NOT NULL DEFAULT 'DISPATCHED',
    "deliveredAt" TIMESTAMP(3),
    "receivedBy" TEXT,
    "note" TEXT,
    "stockEntryId" TEXT,
    "invoiceId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RmcBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RmcBatchLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "designQty" DECIMAL(18,3) NOT NULL,
    "actualQty" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "RmcBatchLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RmcInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "orderId" TEXT,
    "date" DATE NOT NULL,
    "status" "RmcInvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "quantity" DECIMAL(18,3) NOT NULL,
    "concrete" DECIMAL(18,2) NOT NULL,
    "pumping" DECIMAL(18,2) NOT NULL,
    "taxable" DECIMAL(18,2) NOT NULL,
    "cgst" DECIMAL(18,2) NOT NULL,
    "sgst" DECIMAL(18,2) NOT NULL,
    "igst" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelNote" TEXT,
    "tallyExportId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RmcInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RmcReceipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "reference" TEXT,
    "tallyExportId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RmcReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MixDesign_plantId_idx" ON "MixDesign"("plantId");

-- CreateIndex
CREATE UNIQUE INDEX "MixDesign_organizationId_code_key" ON "MixDesign"("organizationId", "code");

-- CreateIndex
CREATE INDEX "MixDesignLine_mixDesignId_idx" ON "MixDesignLine"("mixDesignId");

-- CreateIndex
CREATE INDEX "RmcOrder_plantId_status_idx" ON "RmcOrder"("plantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RmcOrder_organizationId_orderNo_key" ON "RmcOrder"("organizationId", "orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "RmcBatch_stockEntryId_key" ON "RmcBatch"("stockEntryId");

-- CreateIndex
CREATE INDEX "RmcBatch_plantId_date_idx" ON "RmcBatch"("plantId", "date");

-- CreateIndex
CREATE INDEX "RmcBatch_orderId_idx" ON "RmcBatch"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "RmcBatch_organizationId_batchNo_key" ON "RmcBatch"("organizationId", "batchNo");

-- CreateIndex
CREATE INDEX "RmcBatchLine_batchId_idx" ON "RmcBatchLine"("batchId");

-- CreateIndex
CREATE INDEX "RmcInvoice_clientId_idx" ON "RmcInvoice"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "RmcInvoice_organizationId_invoiceNo_key" ON "RmcInvoice"("organizationId", "invoiceNo");

-- CreateIndex
CREATE INDEX "RmcReceipt_clientId_idx" ON "RmcReceipt"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityTest_rmcBatchId_key" ON "QualityTest"("rmcBatchId");

-- AddForeignKey
ALTER TABLE "QualityTest" ADD CONSTRAINT "QualityTest_rmcBatchId_fkey" FOREIGN KEY ("rmcBatchId") REFERENCES "RmcBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MixDesign" ADD CONSTRAINT "MixDesign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MixDesign" ADD CONSTRAINT "MixDesign_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MixDesign" ADD CONSTRAINT "MixDesign_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MixDesign" ADD CONSTRAINT "MixDesign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MixDesignLine" ADD CONSTRAINT "MixDesignLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MixDesignLine" ADD CONSTRAINT "MixDesignLine_mixDesignId_fkey" FOREIGN KEY ("mixDesignId") REFERENCES "MixDesign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MixDesignLine" ADD CONSTRAINT "MixDesignLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcOrder" ADD CONSTRAINT "RmcOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcOrder" ADD CONSTRAINT "RmcOrder_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcOrder" ADD CONSTRAINT "RmcOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcOrder" ADD CONSTRAINT "RmcOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcOrder" ADD CONSTRAINT "RmcOrder_mixDesignId_fkey" FOREIGN KEY ("mixDesignId") REFERENCES "MixDesign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcOrder" ADD CONSTRAINT "RmcOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcBatch" ADD CONSTRAINT "RmcBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcBatch" ADD CONSTRAINT "RmcBatch_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcBatch" ADD CONSTRAINT "RmcBatch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RmcOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcBatch" ADD CONSTRAINT "RmcBatch_mixDesignId_fkey" FOREIGN KEY ("mixDesignId") REFERENCES "MixDesign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcBatch" ADD CONSTRAINT "RmcBatch_stockEntryId_fkey" FOREIGN KEY ("stockEntryId") REFERENCES "StockEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcBatch" ADD CONSTRAINT "RmcBatch_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "RmcInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcBatch" ADD CONSTRAINT "RmcBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcBatchLine" ADD CONSTRAINT "RmcBatchLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcBatchLine" ADD CONSTRAINT "RmcBatchLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RmcBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcBatchLine" ADD CONSTRAINT "RmcBatchLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcInvoice" ADD CONSTRAINT "RmcInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcInvoice" ADD CONSTRAINT "RmcInvoice_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcInvoice" ADD CONSTRAINT "RmcInvoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcInvoice" ADD CONSTRAINT "RmcInvoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RmcOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcInvoice" ADD CONSTRAINT "RmcInvoice_tallyExportId_fkey" FOREIGN KEY ("tallyExportId") REFERENCES "TallyExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcInvoice" ADD CONSTRAINT "RmcInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcReceipt" ADD CONSTRAINT "RmcReceipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcReceipt" ADD CONSTRAINT "RmcReceipt_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcReceipt" ADD CONSTRAINT "RmcReceipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "RmcInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcReceipt" ADD CONSTRAINT "RmcReceipt_tallyExportId_fkey" FOREIGN KEY ("tallyExportId") REFERENCES "TallyExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmcReceipt" ADD CONSTRAINT "RmcReceipt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Row-level security (see 20261013211500_tenant_rls)
ALTER TABLE "MixDesign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MixDesign" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MixDesign"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "MixDesignLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MixDesignLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MixDesignLine"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "RmcOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RmcOrder" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RmcOrder"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "RmcBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RmcBatch" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RmcBatch"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "RmcBatchLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RmcBatchLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RmcBatchLine"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "RmcInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RmcInvoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RmcInvoice"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "RmcReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RmcReceipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RmcReceipt"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
