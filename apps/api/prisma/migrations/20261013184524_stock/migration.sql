-- CreateEnum
CREATE TYPE "StockEntryType" AS ENUM ('RECEIPT', 'ISSUE', 'ADJUSTMENT');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'LOW_STOCK';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "stockEntryId" TEXT;

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "StockEntryType" NOT NULL,
    "entryNo" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "materialRequestId" TEXT,
    "supplier" TEXT,
    "challanNo" TEXT,
    "vehicleNo" TEXT,
    "issuedTo" TEXT,
    "activityId" TEXT,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTxn" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "StockEntryType" NOT NULL,
    "date" DATE NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "materialRequestItemId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StockTxn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMinLevel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "minQty" DECIMAL(18,3) NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockMinLevel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Item_organizationId_name_unit_key" ON "Item"("organizationId", "name", "unit");

-- CreateIndex
CREATE INDEX "StockEntry_projectId_date_idx" ON "StockEntry"("projectId", "date");

-- CreateIndex
CREATE INDEX "StockEntry_organizationId_type_date_idx" ON "StockEntry"("organizationId", "type", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StockEntry_organizationId_entryNo_key" ON "StockEntry"("organizationId", "entryNo");

-- CreateIndex
CREATE INDEX "StockTxn_projectId_itemId_idx" ON "StockTxn"("projectId", "itemId");

-- CreateIndex
CREATE INDEX "StockTxn_entryId_idx" ON "StockTxn"("entryId");

-- CreateIndex
CREATE INDEX "StockTxn_materialRequestItemId_idx" ON "StockTxn"("materialRequestItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMinLevel_projectId_itemId_key" ON "StockMinLevel"("projectId", "itemId");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_materialRequestId_fkey" FOREIGN KEY ("materialRequestId") REFERENCES "MaterialRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTxn" ADD CONSTRAINT "StockTxn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTxn" ADD CONSTRAINT "StockTxn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTxn" ADD CONSTRAINT "StockTxn_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "StockEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTxn" ADD CONSTRAINT "StockTxn_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTxn" ADD CONSTRAINT "StockTxn_materialRequestItemId_fkey" FOREIGN KEY ("materialRequestItemId") REFERENCES "MaterialRequestItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMinLevel" ADD CONSTRAINT "StockMinLevel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMinLevel" ADD CONSTRAINT "StockMinLevel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMinLevel" ADD CONSTRAINT "StockMinLevel_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMinLevel" ADD CONSTRAINT "StockMinLevel_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_stockEntryId_fkey" FOREIGN KEY ("stockEntryId") REFERENCES "StockEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
