-- Item 169: a signed letter waiting for the seal at head office; item 167: verticals on projects and tenders
-- AlterTable
ALTER TABLE "Letter" ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signedById" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "letterSeal" "LetterApprovalRule" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "verticalCode" TEXT;

-- AlterTable
ALTER TABLE "Tender" ADD COLUMN     "verticalCode" TEXT;

-- CreateIndex
CREATE INDEX "Project_organizationId_verticalCode_idx" ON "Project"("organizationId", "verticalCode");

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing projects take the vertical of their built-in type (verticalOfType in @erp/shared/verticals.ts)
UPDATE "Project" SET "verticalCode" = CASE "type"
  WHEN 'WATER_SUPPLY' THEN 'water'
  WHEN 'SEWERAGE' THEN 'water'
  WHEN 'BUILDING' THEN 'buildings'
  WHEN 'ROAD' THEN 'roads-and-bridges'
  ELSE NULL END
WHERE "verticalCode" IS NULL;
