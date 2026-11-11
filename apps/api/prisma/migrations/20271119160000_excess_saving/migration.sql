-- Excess and saving statement (ARCHITECTURE "Excess and saving statement"): a BOQ item's excess item for quantity
-- beyond the deviation limit at a revised rate, its anticipated final quantity, and a variation line paid at its own rate.
-- AlterTable
ALTER TABLE "BoqItem" ADD COLUMN     "anticipatedQty" DECIMAL(18,3),
ADD COLUMN     "excessOfId" TEXT;

-- AlterTable
ALTER TABLE "VariationLine" ADD COLUMN     "ownRate" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "BoqItem_excessOfId_idx" ON "BoqItem"("excessOfId");

-- AddForeignKey
ALTER TABLE "BoqItem" ADD CONSTRAINT "BoqItem_excessOfId_fkey" FOREIGN KEY ("excessOfId") REFERENCES "BoqItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

