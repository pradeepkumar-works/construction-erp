-- AlterEnum (PostgreSQL 12+ allows several values in one migration; none is used by this migration itself)

ALTER TYPE "StockEntryType" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "StockEntryType" ADD VALUE 'TRANSFER_IN';
ALTER TYPE "StockEntryType" ADD VALUE 'RETURN_TO_VENDOR';
ALTER TYPE "StockEntryType" ADD VALUE 'RETURN_FROM_SITE';

-- AlterTable
ALTER TABLE "StockEntry" ADD COLUMN     "toProjectId" TEXT,
ADD COLUMN     "transferOutId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StockEntry_transferOutId_key" ON "StockEntry"("transferOutId");

-- CreateIndex
CREATE INDEX "StockEntry_toProjectId_idx" ON "StockEntry"("toProjectId");

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_toProjectId_fkey" FOREIGN KEY ("toProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_transferOutId_fkey" FOREIGN KEY ("transferOutId") REFERENCES "StockEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

