-- AlterEnum
ALTER TYPE "IntegrationKind" ADD VALUE 'WEIGHBRIDGE';

-- CreateTable
CREATE TABLE "Weighing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "weightKg" DECIMAL(18,3) NOT NULL,
    "stableSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Weighing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeighTicket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ticketNo" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "purchaseOrderLineId" TEXT,
    "challanNo" TEXT,
    "challanQty" DECIMAL(18,3),
    "firstKg" DECIMAL(18,3) NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL,
    "firstWeighingId" TEXT,
    "secondKg" DECIMAL(18,3),
    "secondAt" TIMESTAMP(3),
    "secondWeighingId" TEXT,
    "stockEntryId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeighTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Weighing_projectId_at_idx" ON "Weighing"("projectId", "at");

-- CreateIndex
CREATE INDEX "Weighing_organizationId_at_idx" ON "Weighing"("organizationId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "WeighTicket_firstWeighingId_key" ON "WeighTicket"("firstWeighingId");

-- CreateIndex
CREATE UNIQUE INDEX "WeighTicket_secondWeighingId_key" ON "WeighTicket"("secondWeighingId");

-- CreateIndex
CREATE UNIQUE INDEX "WeighTicket_stockEntryId_key" ON "WeighTicket"("stockEntryId");

-- CreateIndex
CREATE INDEX "WeighTicket_projectId_createdAt_idx" ON "WeighTicket"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "WeighTicket_purchaseOrderId_idx" ON "WeighTicket"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "WeighTicket_organizationId_ticketNo_key" ON "WeighTicket"("organizationId", "ticketNo");

-- AddForeignKey
ALTER TABLE "Weighing" ADD CONSTRAINT "Weighing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Weighing" ADD CONSTRAINT "Weighing_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Weighing" ADD CONSTRAINT "Weighing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeighTicket" ADD CONSTRAINT "WeighTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeighTicket" ADD CONSTRAINT "WeighTicket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeighTicket" ADD CONSTRAINT "WeighTicket_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeighTicket" ADD CONSTRAINT "WeighTicket_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeighTicket" ADD CONSTRAINT "WeighTicket_firstWeighingId_fkey" FOREIGN KEY ("firstWeighingId") REFERENCES "Weighing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeighTicket" ADD CONSTRAINT "WeighTicket_secondWeighingId_fkey" FOREIGN KEY ("secondWeighingId") REFERENCES "Weighing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeighTicket" ADD CONSTRAINT "WeighTicket_stockEntryId_fkey" FOREIGN KEY ("stockEntryId") REFERENCES "StockEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeighTicket" ADD CONSTRAINT "WeighTicket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security, as for every tenant table (20261013211500_tenant_rls)

ALTER TABLE "Weighing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Weighing" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Weighing"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "WeighTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WeighTicket" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WeighTicket"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
